# monorepo-typescript
An example of a monorepo using `typescript` and `tsx`.

### Usage
The `build` step will output ESM compatible modules to `dist/*`, for each package in `packages/*`.

```bash
$ pnpm build
```

The `test` step will verify the types of the packages using `tsc` and run the unit tests in `tests/`.

```bash
$ pnpm test
```

## LICENSE [MIT](LICENSE)
