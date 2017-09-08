module.exports = function optimizePackageTree({name, reference, dependencies}) {
  dependencies = dependencies.map(optimizePackageTree)

  for(let dependency of dependencies.slice()) {
    for(let sub of dependency.dependencies.slice()) {
      const available = dependencies.find(d => d.name === sub.name)

      if(!available) {
        dependencies.push(sub)
      }

      if(!available || available.reference === sub.reference) {
        const index = dependency.dependencies.findIndex(d => d.name === sub.name)
        dependency.dependencies.splice(index)
      }
    }
  }

  return {name, reference, dependencies}
}
