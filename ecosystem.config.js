module.exports = {
    apps: [{
        name: 'random-chat',
        script: 'backend/server.js',
        instances: 1,
        exec_mode: 'fork',
        env: {
            NODE_ENV: 'production',
            PORT: 3001,
            HOST: '0.0.0.0'
        },
        error_file: './logs/err.log',
        out_file: './logs/out.log',
        log_file: './logs/combined.log',
        time: true
    }]
};