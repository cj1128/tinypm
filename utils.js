const gunzipMaybe = require("gunzip-maybe")
const tar = require("tar-stream")
const semver = require("semver")
const tarFs = require("tar-fs")
const Progress = require("progress")
const cp = require("child_process")
const util = require("util")

const exec = util.promisify(cp.exec)

const isPinnedReference = ref => semver.valid(ref) != null

const readPackageJSONFromArchive = buffer => readFileFromArchive("package.json", buffer, 1)

const extractNPMArchiveTo = (buffer, target) => extractArchiveTo(buffer, target, 1)

const transformDependencies = deps => Object.keys(deps || {}).map(name => ({
  name,
  reference: deps[name],
}))

async function trackProgress(cb) {
  const progress = new Progress(`:bar :current/:total (:elapseds)`, {
    width: 80,
    total: 1,
    clear: true,
  })
  try {
    return await cb(progress)
  } finally {
    if (!progress.complete) {
      progress.update(1)
      progress.terminate()
    }
  }
}

function readFileFromArchive(fileName, buffer, virtualPath = 0) {
  return new Promise(function(resolve, reject) {
    const extractor = tar.extract()

    extractor.on("entry", (header, stream, next) => {
      if(getFileName(header.name, virtualPath) === fileName) {
        var buffers = []
        stream.on("data", data => buffers.push(data))
        stream.on("error", reject)
        stream.on("end", () => resolve(Buffer.concat(buffers)))
      } else {
        stream.on("end", next)
      }

      stream.resume()
    })

    extractor.on("error", reject)
    extractor.on("finish", () => {
      reject(new Error(`Could not find "${fileName}" inside the archive`))
    })

    const gunzipper = gunzipMaybe()
    gunzipper.pipe(extractor)
    gunzipper.on("error", reject)
    gunzipper.write(buffer)
    gunzipper.end()
  })
}

function extractArchiveTo(buffer, target, virtualPath = 0) {
  return new Promise((resolve, reject) => {
    const map = header => {
      header.name = getFileName(header.name, virtualPath)
      return header
    }
    const gunzipper = gunzipMaybe()
    const extractor = tarFs.extract(target, {map})
    gunzipper.pipe(extractor)
    extractor.on("error", err => reject(err))
    extractor.on("finish", resolve)
    gunzipper.write(buffer)
    gunzipper.end()
  })
}

function getFileName(entryName, virtualPath) {
  entryName = entryName.replace(/^\/+/, "")
  for(let i = 0; i < virtualPath; i++) {
    const index = entryName.indexOf("/")
    if(index === -1) {
      return null
    }
    entryName = entryName.substr(index + 1)
  }
  return entryName
}

module.exports = {
  exec,
  isPinnedReference,
  readPackageJSONFromArchive,
  extractNPMArchiveTo,
  trackProgress,
  transformDependencies,
}
