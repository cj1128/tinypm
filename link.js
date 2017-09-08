const cp = require("child_process")
const util = require("util")
const exec = util.promisify(cp.exec)
const fs = require("fs-extra")
const fetchPackage = require("./fetch")
const { resolve, relative } = require("path")
const { extractNpmArchiveTo } = require("./utils")

module.exports = async function linkPackages({name, reference, dependencies}, cwd) {
  // not root package
  if(reference !== undefined) {
    const packageBuffer = await fetchPackage({name, reference})
    await extractNpmArchiveTo(packageBuffer, cwd)
  }

  await Promise.all(dependencies.map(async ({name, reference, dependencies}) => {
    // link dependencies
    const target = `${cwd}/node_modules/${name}`
    await linkPackages({name, reference, dependencies}, target)

    // install binaries
    const binTarget = `${cwd}/node_modules/.bin`
    const dependencyPackage = require(`${target}/package.json`)
    let bin = dependencyPackage.bin || {}
    if(typeof bin === "string") {
      bin = {[name]: bin}
    }
    for(const binName of Object.keys(bin)) {
      const source = resolve(target, bin[binName])
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
                PATH: `${target}/node_modules/.bin:${process.env.PATH}`,
              },
            ),
          },
        )
      }
    }
  }))
}
