//  MIT License
//
//  Copyright (c) 2023 Daniel Cousens
//
//  Permission is hereby granted, free of charge, to any person obtaining a copy
//  of this software and associated documentation files (the "Software"), to deal
//  in the Software without restriction, including without limitation the rights
//  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//  copies of the Software, and to permit persons to whom the Software is
//  furnished to do so, subject to the following conditions:
//
//  The above copyright notice and this permission notice shall be included in all
//  copies or substantial portions of the Software.
//
//  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//  SOFTWARE.
import { inc, type ReleaseType } from 'semver'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execa = promisify(exec)

const PATHS = {
  packages: './packages/',
  changes: './changes.yaml',
  contributors: './contributors.yaml',
  template: './RELEASE.md.template',
  output: `./${new Date().toJSON().slice(0, 10)}.RELEASE.md`
}

async function readPackages () {
  return await Promise.all((await readdir(PATHS.packages, { withFileTypes: true }))
    .filter(f => f.isDirectory())
    .map(async (f) => {
      const json = JSON.parse(await readFile(`${f.path}/${f.name}/package.json`, 'utf8'))
      return {
        name: f.name,
        path: `${f.path}/${f.name}/`,
        affected: false,
        json
      }
    }))
}

type Package = Awaited<ReturnType<typeof readPackages>>[number]

async function readChanges (packages: Package[]) {
  return (await readFile(PATHS.changes, 'utf8'))
    .split('\n\n')
    .map(part => part
      .split('\n')
      .filter(line => line.length && !line.startsWith('#'))
      .map(line => line.split(':'))
      .map(([k, v]) => [k?.trim(), v?.trim()] as const)
    )
    .filter(part => part.length)
    .map(part => Object.fromEntries<string>(part))
    .map((change) => {
      return change.package
        .split(',')
        .map((p: string) => ({
          package: p,
          type: change.type as ReleaseType,
          description: change.description,
          pr: change.pr,
          by: change.by.split(',').map(w => `@${w.trim()}`)
        }))
    })
    .flat()
    // resolve packages
    .map((change) => {
      const p = packages.find(p => p.name === change.package)
      if (!p) throw new Error(`Could not find ${change.package}`)
      return {
        ...change,
        package: p,
      }
    })
}

type Change = Awaited<ReturnType<typeof readChanges>>[number]

async function readContributors () {
  return (await readFile(PATHS.contributors, 'utf8'))
    .split('\n')
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2))
}

async function affect (change: Change) {
  change.package.json.version = inc(change.package.json.version, change.type)
  change.package.affected = true
}

type GitHubCommit = {
  author: {
    login: string
  }
  commit: {
    message: string
  }
}

async function fetchMappedCommits (changes: Change[]) {
  const json = await (await fetch('https://api.github.com/repos/dcousens/monorepo-typescript/commits')).json() as GitHubCommit[]
  return json.map(({
    author: {
      login: author
    },
    commit: {
      message
    }
  }) => {
    const pr = (message as string).match(/\(#([0-9]+)\)/)?.[1] ?? null
    return {
      author,
      known: changes.some(c => c.pr === pr)
    }
  })
}

async function writeRelease (affected: Package[], changes: Change[]) {
  function formatChange (ch: Change) {
    return `- [${ch.package.name}] ${ch.description} (#${ch.pr}), thanks ${ch.by.join(', ')}`
  }

  const contributors = new Set(await readContributors())
  const commits = await fetchMappedCommits(changes)
  const template = await readFile('RELEASE.md.template', 'utf8')

  const result = template
    .replaceAll(`%PACKAGES`, affected.map(p => `- ${p.name}`).join('\n'))
    .replaceAll(`%MAJORS`, changes.filter(x => x.type === 'major').map(c => formatChange(c)).join('\n'))
    .replaceAll(`%MINORS`, changes.filter(x => x.type === 'minor').map(c => formatChange(c)).join('\n'))
    .replaceAll(`%PATCHES`, changes.filter(x => x.type === 'patch').map(c => formatChange(c)).join('\n'))
    .replaceAll(`%NEW_CONTRIBUTORS`, 'TODO')
    .replaceAll(`%ACK_CONTRIBUTORS`, [
      ...new Set(
        commits
          .filter(c => !c.known)
          .map(c => `@${c.author}`)
      )
    ].join(', '))

  await writeFile(PATHS.output, result)
  // TODO: write contributors
}

async function main () {
  const packages = await readPackages()
  const changes = await readChanges(packages)
  for (const change of changes.filter(x => x.type === 'patch')) affect(change)
  for (const change of changes.filter(x => x.type === 'minor')) affect(change)
  for (const change of changes.filter(x => x.type === 'major')) affect(change)
  const affected = packages.filter(p => p.affected)

  if (process.argv.includes('--notes')) {
    await writeRelease(affected, changes)
    return
  }

  if (process.argv.includes('--bump')) {
    for (const p of packages) {
      await writeFile(`${p.path}/package.json`, JSON.stringify(p.json, null, 2))
    }
    return
  }

  if (process.argv.includes('--publish-tag-push')) {
    for (const p of affected) {
      await execa(`pnpm publish --access=public --tag latest ${p.path}`)
      await execa(`git tag ${p.json.name}@${p.json.version}`)
    }
    await execa(`git push --tags`)
    return
  }
}

main()
