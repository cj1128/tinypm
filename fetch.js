const { isPinnedReference } = require("./utils")
const assert = require("assert")
const fetch = require("node-fetch")

module.exports = async function fetchPackage({name, reference}) {
  // reference is a local file path
  if(["/", "./", "../"].some(prefix => reference.startsWith(prefix))) {
    return await fs.readFile(reference)
  }

  // reference must be a pinned reference
  assert(!isPinnedReference(reference), "Must provide pinned reference or local path to fetchPackage, got " + reference)

  const url = `https://registry.yarnpkg.com/${name}/-/${name}-${reference}.tgz`

  const res = await fetch(url)

  if(!res.ok) {
    throw new Error("Could not fetch package ${reference}")
  }

  return await res.buffer()
}
