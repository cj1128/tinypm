const {
  readPackageJSONFromArchive,
  isPinnedReference,
  transformDependencies,
} = require("./utils")
const semver = require("semver")
const { fetchPackage, NPM_REGISTRY, fetchPackageInfo } = require("./fetch")
const url = require("url")

// recursive function
// input: {name, reference, dependencies: [{name, reference}]}
// output: {name, reference, expanded_dependencies: [{name, reference, dependencies}]}
async function getPackageDependencyTree(progress, {name, reference, dependencies}, available = new Map()) {
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
      progress.total += 1

      const pinnedDep = await getPinnedReference(dep)
      progress.tick()

      const subDependencies = await getPackageDependencies(pinnedDep)

      available.set(pinnedDep.name, pinnedDep.reference)

      return getPackageDependencyTree(progress, Object.assign({}, pinnedDep, {dependencies: subDependencies}), available)
    }))
  }
}

module.exports = getPackageDependencyTree

/*----------  Private  ----------*/

const pinnedReferenceCache = new Map()

async function getPinnedReference({name, reference}) {
  const cacheKey = name + "/" + reference

  if(pinnedReferenceCache.get(cacheKey)) {
    return {
      name,
      reference: pinnedReferenceCache.get(cacheKey),
    }
  }

  if(!isPinnedReference(reference)) {
    const info = await fetchPackageInfo(name)
    const versions = Object.keys(info.versions)
    const maxSatisfying = semver.maxSatisfying(versions, reference)

    if(maxSatisfying == null) {
      throw new Error(`Could not find a version matching ${reference} for package ${name}`)
    }

    reference = maxSatisfying
    pinnedReferenceCache.set(cacheKey, reference)
  }

  return {name, reference}
}

async function getPackageDependencies({name, reference}) {
  const info = await fetchPackageInfo(name)
  return transformDependencies(info.versions[reference].dependencies)
}
