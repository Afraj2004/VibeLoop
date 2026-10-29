// Row IDs are BIGINT identity values. node-postgres returns BIGINT as a string, so IDs are
// handled as decimal strings everywhere (JWT claims, socket rooms, Redis keys, JSON).
const ID_PATTERN = /^[1-9][0-9]{0,17}$/;

const isId = (value) => ID_PATTERN.test(String(value ?? ''));

module.exports = { ID_PATTERN, isId };
