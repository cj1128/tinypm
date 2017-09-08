const gunzipMaybe = require("gunzip-maybe")
const tar = require("tar-stream")
const semver = require("semver")
const tarFs = require("tar-fs")
const Progress = require("progress")

module.exports.isPinnedReference = ref => !semver.validRange(ref) && semver.valid(ref)

module.exports.readPackageJSONFromArchive = function(buffer) {
  return readFileFromArchive("package.json", buffer, 1)
}

module.exports.extractNpmArchiveTo = function(buffer, target) {
  return extractArchiveTo(buffer, target, 1)
}

module.exports.trackProgress = async function(cb) {
  const progress = new Progress(`:bar :current/:total (:elapseds)`, {width: 80, total: 1})
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
