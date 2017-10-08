#!/usr/bin/env node
const getPackageDependencyTree = require("./resolve")
const optimizePackageTree = require("./optimize")
const linkPackages = require("./link")
const path = require("path")
const log = console.log
const chalk = require("chalk")
const fs = require("fs-extra")
const { trackProgress } = require("./utils")
const { fetchPackages } = require("./fetch")
const ElapstedTime = require("elapsed-time")

// for debug
process.on("unhandledRejection", (reason, p) => {
  console.log("Unhandled Rejection at: Promise", p, "reason:", reason)
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

const packageJSON = require(path.resolve(cwd, "package.json"))

// process dependencies
packageJSON.dependencies = Object.keys(packageJSON.dependencies || {}).map(name => {
  return {
    name,
    reference: packageJSON.dependencies[name],
  }
})

// process dev dependencies
Object.keys(packageJSON.devDependencies || {}).forEach(name => {
  packageJSON.dependencies.push({
    name,
    reference: packageJSON.devDependencies[name],
  })
})

const et = ElapstedTime.new().start()

Promise.resolve()
  .then(() => {
    log("[1/3] 🔎  Resolving packages...")
    return trackProgress(progress => getPackageDependencyTree(progress, packageJSON))
  })
  .then(optimizePackageTree)
  .then(async tree => {
    log("[2/3] 🚢  Fetching packages...")
    await trackProgress(progress => fetchPackages(progress, tree))
    return tree
  })
  .then(tree => {
    log("[3/3] 🔗  Linking packages...")
    return trackProgress(progress => linkPackages(progress, tree, cwd))
  })
  .then(() => {
    log(` ✨  ${chalk.green("Done")} in ${et.getValue()}.`)
  })
