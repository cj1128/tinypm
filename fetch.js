const { isPinnedReference } = require("./utils")
const cp = require("child_process")
const assert = require("assert")
const axios = require("axios")
const CancelToken = axios.CancelToken
const fs = require("fs-extra")
const path = require("path")
const url = require("url")
const http = require("http")
const https = require("https")

const CACHE_DIR = "/tmp/.tinypm"

const FETCH_TIMEOUT = 20 * 1000 // in milliseconds

const httpClient = new http.Agent({keepAlive: true})
const httpsClient = new https.Agent({keepAlive: true})

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
  assert(isPinnedReference(reference), "Must provide pinned reference or local path to fetchPackage, got " + reference)

  // found in cache
  const cachePath = path.join(CACHE_DIR, `${name}-${reference}.tgz`)
  let buffer = await fetchInCache(cachePath)
  if(buffer != null) return buffer

  const packageURL = url.resolve(NPM_REGISTRY, `/${name}/-/${name}-${reference}.tgz`)

  const res = await fetch(packageURL)
  buffer = res.data
  await writeCache(buffer, cachePath)
  return buffer
}

async function fetchPackages(progress, {name, reference, dependencies}) {
  // `reference === undefined` means root package
  if(reference !== undefined) {
    await fetchPackage({name, reference})
    progress.tick()
  }

  await Promise.all(dependencies.map(async dep => {
    progress.total += 1
    await fetchPackages(progress, dep)
  }))
}

const packageInfoCache = new Map()

async function fetchPackageInfo(name) {
  if(packageInfoCache.get(name)) return packageInfoCache.get(name)
  const res = await fetch(url.resolve(NPM_REGISTRY, name))
  const info = res.data
  packageInfoCache.set(name, info)
  return info
}

module.exports = {
  NPM_REGISTRY,
  fetchPackage,
  fetchPackages,
  fetchPackageInfo,
}

/*----------  Private  ----------*/

// return file content as Buffer or null
async function fetchInCache(filePath) {
  if(fs.existsSync(filePath)) {
    return await fs.readFile(filePath)
  }
  return null
}

async function writeCache(buffer, filePath) {
  // name may contain '/', like @cj/package
  fs.mkdirpSync(path.dirname(filePath))
  await fs.writeFile(filePath, buffer)
}

const waitQueue = []
const REQUEST_LIMIT = 10
const RETRY_TIMES = 3
let activeCount = 0

async function fetch(url) {
  return await fetchWithThrottle(url)
}

async function fetchWithThrottle(url) {
  if(activeCount >= REQUEST_LIMIT) {
    let startToken
    const waitPromise = new Promise(r => startToken = r)
    waitQueue.push(startToken)
    await waitPromise
  }

  activeCount++

  const result = await fetchWithRetry(url)

  activeCount--
  if(waitQueue.length > 0) {
    waitQueue.shift()()
  }

  return result
}


async function fetchWithRetry(url, retryTimes=RETRY_TIMES) {
  let e
  for(let i = 0; i < retryTimes; i++) {
    const source = CancelToken.source()
    const timer = setTimeout(source.cancel, FETCH_TIMEOUT)
    try {
      const config = {
        cancelToken: source.token,
        httpAgent: httpClient,
        httpsAgent: httpsClient,
      }
      if(url.endsWith(".tgz")) {
        config.responseType = "arraybuffer"
      }
      const result = await axios.get(url, config)
      if(result.status !== 200) throw new Error("bad status code:", result.status)
      return result
    } catch(err) {
      e = err
    } finally {
      clearTimeout(timer)
    }
  }
  throw e
}
