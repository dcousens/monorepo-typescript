import { test, beforeEach } from 'node:test'
import { equal } from 'node:assert/strict'

import foo from '@dcousens/foo'
import { bar } from '@dcousens/bar'

test(() => {
  const output = foo() + bar()

  equal(output, 'foobar', 'oh oh')
})
