<p align="center">
  <img alt="TinyPM Logo" src="http://ww1.sinaimg.cn/large/9b85365dgy1fnjev4v3j6j208a02q746" />
</p>

<h2 align="center">A tiny nodejs package manager built for fun</h2>

<p align="center">
  <a href="https://mit-license.org/2018">
    <img src="http://img.shields.io/badge/license-MIT-blue.svg?style=flat-square"> 
  </a>
</p>

## Intro

this project is heavily inspired by the awesome post: [Let's Dev: A Package Manager](https://yarnpkg.com/blog/2017/07/11/lets-dev-a-package-manager/) but reimplement it from scratch.

It has a clean code base, add some tests and remove `babel-node` requirement compared to original implementation.

## Usage

just type `tinypm` and you are done 😎.

## Implementation

the whole process is divided into 3 steps implemented in corresponding js files.

1. resolve: read package.json and resolve the whole dependency tree
2. optimize: optimize the dependency tree, try to flat it as much as we can
3. link: download packages and link them to node_modules folder

to speed up the processing, `tinypm` uses `/tmp/.tinypm` as cache dir.

## Notes

as the original implementation, **the binary installation directory is wrong**. 

e.g. if package `A` depends on package `B` which has a binary called `cli-b`, `tinypm` will install `cli-b` to `root/node_modules/.bin/cli-b`, but the correct location is `root/node_modules/A/node_modules/.bin/cli-b`.

## License

Released under the [MIT license](http://mit-license.org/2018)
