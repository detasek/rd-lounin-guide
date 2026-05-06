const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`rd-lounin-api legacy shim listening on ${PORT}`);
});
