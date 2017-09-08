const cp = require("child_process")
const util = require("util")
const exec = util.promisify(cp.exec)
const fs = require("fs-extra")
const { fetchPackage } = require("./fetch")
const { resolve, relative, join } = require("path")
const { extractNpmArchiveTo } = require("./utils")

async function linkPackage(progress, {name, reference}, cwd) {
  progress.total += 1
  if(fs.existsSync(cwd)) {
    progress.tick()
    return
  }

  const buffer = await fetchPackage({name, reference})
  await extractNpmArchiveTo(buffer, cwd)

  // install binaries
  const binTarget = join(cwd, "..", ".bin")
  const dependencyPackage = require(`${cwd}/package.json`)
  let bin = dependencyPackage.bin || {}
  if(typeof bin === "string") {
    bin = {[name]: bin}
  }
  for(const binName of Object.keys(bin)) {
    const source = resolve(cwd, bin[binName])
    const dest = `${binTarget}/${binName}`
    // TODO: 对于`http-server`这个包
    // 来说，tgz文件中，可执行的js文件是没有x权限的，使用`yarn`安装以后，却是有
    // 执行权限的，这里我们修改源文件的权限，后面需要查明yarn是如何处理的
    await fs.chmod(source, "755")
    await fs.mkdirp(binTarget)
    await fs.symlink(relative(binTarget, source), dest)
  }

  // execute scripts
  if(dependencyPackage.scripts) {
    for(const scriptName of ["preinstall", "install", "postinstall"]) {
      const script = dependencyPackage.scripts[scriptName]
      if(!script) continue
      await exec(
        script,
        {
          cwd: target,
          env: Object.assign(
            {},
            process.env,
            {
              PATH: `${binTarget}:${process.env.PATH}`,
            },
          ),
        },
      )
    }
  }
}

module.exports = async function linkPackages(progress, {name, reference, dependencies}, cwd) {
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
