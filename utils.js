import gunzipMaybe from "gunzip-maybe"
import tar from "tar-stream"

export function readPackageJSONFromArchive(buffer) {
  return readFileFromArchive("package.json", buffer, {virtualPath: 1})
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

export function readFileFromArchive(fileName, buffer, {virtualPath = 0} = {}) {
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
