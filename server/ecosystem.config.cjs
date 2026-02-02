// PM2 Ecosystem Configuration for Serv00 Deployment
module.exports = {
  apps: [{
    name: 'wealth-tracker-api',
    script: 'src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
      DB_MODE: 'turso'
    }
  }]
};
