const { isPinnedReference } = require("./utils")
const cp = require("child_process")
const assert = require("assert")
const fetch = require("node-fetch")
const fs = require("fs-extra")
const path = require("path")
const url = require("url")

const CACHE_DIR = "/tmp/.tinypm"

if(!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR)
}

// get npm registry
const DEFAULT_NPM_REGISTRY = "https://registry.yarnpkg.com"
const NPM_REGISTRY = cp.execSync("npm config get registry").toString("utf8") || DEFAULT_NPM_REGISTRY

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

  const packageURL = url.resolve(NPM_REGISTRY, `/${name}/-/${name}-${reference}.tgz`)

  const res = await fetch(packageURL)

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
  // name may contain '/', like @cj/package
  fs.mkdirpSync(path.dirname(p))
  await fs.writeFile(p, buffer)
}

function getCachePath(name, reference) {
  return path.join(CACHE_DIR, `${name}-${reference}.tgz`)
}

module.exports = {
  fetchPackage,
  fetchPackages,
  NPM_REGISTRY,
}
