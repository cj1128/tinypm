#!/usr/bin/env babel-node
import fetch from "node-fetch"
import semver from "semver"
import fs from "fs-extra"
import { readPackageJSONFromArchive, extractNpmArchiveTo } from "./utils"
import util from "util"
import cp from "child_process"
import {resolve, relative} from "path"

const exec = util.promisify(cp.exec)

async function fetchPackage({name, reference}) {
  // reference is a local file path
  if(["/", "./", "../"].some(prefix => reference.startsWith(prefix))) {
    return await fs.readFile(reference)
  }

  // reference is a version range
  if(semver.validRange(reference) && !semver.valid(reference)) {
    const pinnedReference = await getPinnedReference({name, reference})
    reference = pinnedReference.reference
  }

  // reference is a semver version, e.g. 1.0.0
  if(semver.valid(reference)) {
    return await fetchPackage({name, reference: `https://registry.yarnpkg.com/${name}/-/${name}-${reference}.tgz`})
  }

  const res = await fetch(reference)
  if(!res.ok) {
    throw new Error("Could not fetch package ${reference}")
  }

  return await res.buffer()
}

async function getPinnedReference({name, reference}) {
  // we only process range, e.g. ^1.5.2
  // pinned version is a valid range in semver eyes
  if(semver.validRange(reference) && !semver.valid(reference)) {
    const res = await fetch(`https://registry.yarnpkg.com/${name}`)
    const info = await res.json()
    const versions = Object.keys(info.versions)
    const maxSatisfying = semver.maxSatisfying(versions, reference)

    if(maxSatisfying == null) {
      throw new Error(`Could not find a version matching ${reference} for package ${name}`)
    }

    reference = maxSatisfying
  }

  return {name, reference}
}

async function getPackageDependencies({name, reference}) {
  const packageBuffer = await fetchPackage({name, reference})
  const packageJSON = JSON.parse(await readPackageJSONFromArchive(packageBuffer))
  const dependencies = packageJSON.dependencies || {}
  return Object.keys(dependencies).map(name => {
    return {name, reference: dependencies[name]}
  })
}

// recursive function
// input: {name, reference, dependencies: [{name, reference}]}
// output: {name, reference, expanded_dependencies: [{name, reference, dependencies}]}
async function getPackageDependencyTree({name, reference, dependencies}, available = new Map()) {
  return {
    name,
    reference,
    dependencies: await Promise.all(dependencies.filter(dep => {
      const availableReference = available.get(dep.name)

      // exact match
      if(availableReference === dep.reference) {
        return false
      }

      if(semver.validRange(dep.reference) &&
        semver.satisfies(availableReference, dep.reference)) {
        return false
      }

      return true
    }).map(async dep => {
      const pinnedDep = await getPinnedReference(dep)
      const subDependencies = await getPackageDependencies(pinnedDep)
      const subAvailable = new Map(available)
      subAvailable.set(pinnedDep.name, pinnedDep.reference)
      return getPackageDependencyTree(Object.assign({}, pinnedDep, {dependencies: subDependencies}), subAvailable)
    }))
  }
}

async function linkPackages({name, reference, dependencies}, cwd) {
  // not root package
  if(reference !== undefined) {
    const packageBuffer = await fetchPackage({name, reference})
    await extractNpmArchiveTo(packageBuffer, cwd)
  }

  await Promise.all(dependencies.map(async ({name, reference, dependencies}) => {
    // link dependencies
    const target = `${cwd}/node_modules/${name}`
    await linkPackages({name, reference, dependencies}, target)

    // install binaries
    const binTarget = `${cwd}/node_modules/.bin`
    const dependencyPackage = require(`${target}/package.json`)
    let bin = dependencyPackage.bin || {}
    if(typeof bin === "string") {
      bin = {[name]: bin}
    }
    for(const binName of Object.keys(bin)) {
      const source = resolve(target, bin[binName])
      const dest = `${binTarget}/${binName}`
      // 对于`http-server`这个包
      // 来说，tgz文件中，可执行的js文件是没有x权限的，使用`yarn`安装以后，却是有
      // 执行权限的，这里我们修改源文件的权限，后面需要查明yarn是如何处理的
      await fs.chmod(source, "755")
      await fs.mkdirp(binTarget)
      await fs.symlink(relative(binTarget, source), dest)
    }

    // execute scripts
    if(dependencyPackage.scripts) {
      for(const scriptName of ["preinstall", "install", "postinstall"]) {
        const script = dependencyPackage.scripts[scriptName]
        if(!script) continue
        await exec(
          script,
          {
            cwd: target,
            env: Object.assign(
              {},
              process.env,
              {
                PATH: `${target}/node_modules/.bin:${process.env.PATH}`,
              },
            ),
          },
        )
      }
    }
  }))
}

function optimizePackageTree({name, reference, dependencies}) {
  dependencies = dependencies.map(optimizePackageTree)

  for(let dependency of dependencies.slice()) {
    for(let sub of dependency.dependencies.slice()) {
      const available = dependencies.find(d => d.name === sub.name)

      if(!available) {
        dependencies.push(sub)
      }

      if(!available || available.reference === sub.reference) {
        const index = dependency.dependencies.findIndex(d => d.name === sub.name)
        dependency.dependencies.splice(index)
      }
    }
  }

  return {name, reference, dependencies}
}

const cwd = process.cwd()
const packageJSON = require(resolve(cwd, "package.json"))
packageJSON.dependencies = Object.keys(packageJSON.dependencies || {}).map(name => {
  return {
    name,
    reference: packageJSON.dependencies[name],
  }
})

Promise.resolve()
  .then(() => {
    console.log("Resolving packages...")
    return getPackageDependencyTree(packageJSON)
  })
  .then(optimizePackageTree)
  .then(tree => {
    console.log("Linking packages...")
    linkPackages(tree, cwd)
  })
