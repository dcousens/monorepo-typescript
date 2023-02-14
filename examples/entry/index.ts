import foo from '@dcousens/foo'
import { bar } from '@dcousens/bar'

async function main () {
  const output = foo() + bar()

  console.log(output)
}

main()
