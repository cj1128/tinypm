const { readPackageJSONFromArchive } = require("./utils")
const { isPinnedReference } = require("./utils")
const semver = require("semver")
const fetch = require("node-fetch")
const fetchPackage = require("./fetch")

async function getPinnedReference({name, reference}) {
  // we only process range, e.g. ^1.5.2
  // pinned version is a valid range in semver eyes
  if(!isPinnedReference(reference)) {
    const res = await fetch(`https://registry.yarnpkg.com/${name}`)
    const info = await res.json()
    const versions = Object.keys(info.versions)
    const maxSatisfying = semver.maxSatisfying(versions, reference)

    if(maxSatisfying == null) {
      throw new Error(`Could not find a version matching ${reference} for package ${name}`)
    }

    reference = maxSatisfying
  }

  return {name, reference}
}

async function getPackageDependencies({name, reference}) {
  const packageBuffer = await fetchPackage({name, reference})
  const packageJSON = JSON.parse(await readPackageJSONFromArchive(packageBuffer))
  const dependencies = packageJSON.dependencies || {}
  return Object.keys(dependencies).map(name => {
    return {name, reference: dependencies[name]}
  })
}

// recursive function
// input: {name, reference, dependencies: [{name, reference}]}
// output: {name, reference, expanded_dependencies: [{name, reference, dependencies}]}
module.exports = async function getPackageDependencyTree({name, reference, dependencies}, available = new Map()) {
  return {
    name,
    reference,
    dependencies: await Promise.all(dependencies.filter(dep => {
      const availableReference = available.get(dep.name)

      // exact match
      if(availableReference === dep.reference) {
        return false
      }

      // inside valid range
      if(semver.validRange(dep.reference) &&
        semver.satisfies(availableReference, dep.reference)) {
        return false
      }

      return true
    }).map(async dep => {
      const pinnedDep = await getPinnedReference(dep)
      const subDependencies = await getPackageDependencies(pinnedDep)
      const subAvailable = new Map(available)
      subAvailable.set(pinnedDep.name, pinnedDep.reference)
      return getPackageDependencyTree(Object.assign({}, pinnedDep, {dependencies: subDependencies}), subAvailable)
    }))
  }
}
