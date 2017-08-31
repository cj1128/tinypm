import fetch from "node-fetch"
import semver from "semver"
import fs from "fs-extra"

async function fetchPackage({name, reference}) {
  // reference is a local file path
  if(["/", "./", "../"].some(prefix => reference.startsWith(prefix))) {
    return await fs.readFile(reference)
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

fetchPackage({name: "babel-cli", reference: "6.24.1"}).then(res => {
  console.log("ok!")
})
