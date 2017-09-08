#!/usr/bin/env node
const getPackageDependencyTree = require("./resolve")
const optimizePackageTree = require("./optimize")
const linkPackages = require("./link")
const path = require("path")

const cwd = process.cwd()

// for debug
process.on("unhandledRejection", (reason, p) => {
  console.log("Unhandled Rejection at: Promise", p, "reason:", reason)
})

const packageJSON = require(path.resolve(cwd, "package.json"))

packageJSON.dependencies = Object.keys(packageJSON.dependencies || {}).map(name => {
  return {
    name,
    reference: packageJSON.dependencies[name],
  }
})

Promise.resolve()
  .then(() => {
    console.log("Resolving packages...")
    return getPackageDependencyTree(packageJSON)
  })
  .then(optimizePackageTree)
  .then(tree => {
    console.log("Linking packages...")
    linkPackages(tree, cwd)
  })
