// Mantine's PostCSS preset: lets our CSS modules use Mantine's breakpoints and rem().
module.exports = {
  plugins: {
    'postcss-preset-mantine': {},
    'postcss-simple-vars': {
      variables: {
        'mantine-breakpoint-xs': '36em',
        'mantine-breakpoint-sm': '48em',
        'mantine-breakpoint-md': '62em',
        'mantine-breakpoint-lg': '64em',
        'mantine-breakpoint-xl': '80em',
      },
    },
  },
}
