import fetch from "node-fetch"
import semver from "semver"
import fs from "fs-extra"
import { readPackageJSONFromArchive } from "./utils"

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

getPackageDependencies({name: "prop-types", reference: "^15.5.10"})
  .then(deps => {
    console.log(deps)
  })
