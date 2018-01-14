const fs = require("fs-extra")
const { fetchPackage } = require("./fetch")
const { resolve, relative, join } = require("path")
const { extractNPMArchiveTo, exec } = require("./utils")

async function linkPackages(progress, {name, reference, dependencies}, cwd) {
  // not root package
  if(reference !== undefined) {
    await linkPackage(progress, {name, reference}, cwd)
  }

  await Promise.all(dependencies.map(async ({name, reference, dependencies}) => {
    // link dependencies
    const target = `${cwd}/node_modules/${name}`
    await linkPackages(progress, {name, reference, dependencies}, target)
  }))
}

module.exports = linkPackages

/*----------  Private  ----------*/

async function linkPackage(progress, {name, reference}, cwd) {
  progress.total += 1

  if(fs.existsSync(cwd)) {
    progress.tick()
    return
  }

  const buffer = await fetchPackage({name, reference})
  await extractNPMArchiveTo(buffer, cwd)

  // install binaries
  const binDir = join(cwd, "..", ".bin")
  const dependencyPackage = require(`${cwd}/package.json`)
  let bin = dependencyPackage.bin || {}
  if(typeof bin === "string") {
    bin = {[name]: bin}
  }

  if(Object.keys(bin).length > 0) {
    await fs.mkdirp(binDir)
  }

  for(const binName of Object.keys(bin)) {
    const src = resolve(cwd, bin[binName])
    const dest = `${binDir}/${binName}`
    // need add executive permission manually
    // yarn: https://github.com/yarnpkg/yarn/blob/master/src/package-linker.js#L41
    if(!fs.existsSync(dest)) {
      await fs.symlink(relative(binDir, src), dest)
      await fs.chmod(dest, "755")
    }
  }

  // execute hook scripts
  if(dependencyPackage.scripts) {
    for(const scriptName of ["preinstall", "install", "postinstall"]) {
      const script = dependencyPackage.scripts[scriptName]
      if(!script) continue
      await exec(
        script,
        {
          cwd: cwd,
          env: Object.assign(
            {},
            process.env,
            {
              PATH: `${binDir}:${process.env.PATH}`,
            },
          ),
        },
      )
    }
  }

  progress.tick()
}
