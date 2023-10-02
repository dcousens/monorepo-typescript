import { stringify } from '@dcousens/stringify'
import ms from 'ms'

export function aPrivateFoo () {
  return stringify('foo') + ms('1 hour')
}
