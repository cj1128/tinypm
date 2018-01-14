#!/usr/bin/env node
const getPackageDependencyTree = require("./resolve")
const optimizePackageTree = require("./optimize")
const linkPackages = require("./link")
const path = require("path")
const log = console.log
const chalk = require("chalk")
const fs = require("fs-extra")
const { trackProgress, transformDependencies } = require("./utils")
const { fetchPackages } = require("./fetch")
const ElapstedTime = require("elapsed-time")

process.on("unhandledRejection", (reason, p) => {
  console.log("unhandled promise rejection: ", p, "reason:", reason)
  process.exit(1)
})

// print help info
const arg = process.argv[2]
if(arg === "help" || arg === "-h" || arg === "--help") {
  log(chalk.cyan("tinypm: ") + "a tiny nodejs package manager built for fun 😛")
  log("usage: just type " + chalk.cyan("tinypm") + " to install all your packages")
  log("cache directory is /tmp/.tinypm")
  process.exit(0)
}

const cwd = process.cwd()
const packageJSONPath = path.resolve(cwd, "package.json")

if(!fs.existsSync(packageJSONPath)) {
  log(chalk.red("whoops! no package.json found 😝"))
  process.exit(1)
}

const packageJSON = require(packageJSONPath)

const dependencies = transformDependencies(packageJSON.dependencies)
dependencies.push(...transformDependencies(packageJSON.devDependencies))

const et = ElapstedTime.new().start()

Promise.resolve()
  .then(() => {
    log("[1/3] 🔎  Resolving packages...")
    return trackProgress(progress => getPackageDependencyTree(progress, {
      name: packageJSON.name,
      dependencies,
    }))
  })
  .then(optimizePackageTree)
  .then(async tree => {
    log("[2/3] 🚢  Fetching packages...")
    await trackProgress(progress => fetchPackages(progress, tree))
    return tree
  })
  .then(async tree => {
    log("[3/3] 🔗  Linking packages...")
    await trackProgress(progress => linkPackages(progress, tree, cwd))
  })
  .then(() => {
    log(` ✨  ${chalk.green("Done")} in ${et.getValue()}.`)
  })
