import fetch from "node-fetch"
import semver from "semver"
import fs from "fs-extra"
import { readPackageJSONFromArchive } from "./utils"
import util from "util"

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

  // TODO
  console.log("url:", reference)

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
  console.log(available)
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

const test = {
  "name": "my-awesome-package",
  "dependencies": [
    {
      name: "babel-core",
      reference: "*",
    },
  ],
}

getPackageDependencyTree(test).then(tree => {
  console.log(util.inspect(tree, {depth: Infinity}))
})
