const { isPinnedReference } = require("./utils")
const assert = require("assert")
const fetch = require("node-fetch")
const fs = require("fs-extra")
const path = require("path")

const CACHE_DIR = "/tmp/.tinypm"

if(!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR)
}

async function fetchPackage({name, reference}) {
  // reference is a local file path
  if(["/", "./", "../"].some(prefix => reference.startsWith(prefix))) {
    return await fs.readFile(reference)
  }

  // reference must be a pinned reference
  assert(!isPinnedReference(reference), "Must provide pinned reference or local path to fetchPackage, got " + reference)

  // find in cache
  let buffer = await fetchInCache({name, reference})
  if(buffer != null) return buffer

  const url = `https://registry.yarnpkg.com/${name}/-/${name}-${reference}.tgz`

  const res = await fetch(url)

  if(!res.ok) {
    throw new Error("Could not fetch package ${reference}")
  }

  buffer = await res.buffer()
  await writeCache(buffer, {name, reference})
  return buffer
}

async function fetchPackages(progress, {name, reference, dependencies}) {
  // reference === undefined表示root package
  if(reference !== undefined) {
    await fetchPackage({name, reference})
    progress.tick()
  }

  await Promise.all(dependencies.map(async dep => {
    progress.total += 1
    await fetchPackages(progress, dep)
  }))
}

async function fetchInCache({name, reference}) {
  const p = getCachePath(name, reference)
  if(fs.existsSync(p)) {
    return await fs.readFile(p)
  }
  return null
}

async function writeCache(buffer, {name, reference}) {
  const p = getCachePath(name, reference)
  await fs.writeFile(p, buffer)
}

function getCachePath(name, reference) {
  return path.join(CACHE_DIR, `${name}-${reference}.tgz`)
}

module.exports = {
  fetchPackage,
  fetchPackages,
}
