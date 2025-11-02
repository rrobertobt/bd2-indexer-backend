export default () => ({
  redis: {
    defaultTTL: 60 * 60 * 24, // 24 horas
    defaultPrefix: 'TMP',
  },
});
