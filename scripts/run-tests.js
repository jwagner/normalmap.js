var webdriverio = require('webdriverio');

var browsers = [
    {
        browserName: 'MicrosoftEdge',
        'platform': 'Windows 10',
        'version': '20.10240',
    },
    {
        browserName: 'internet explorer',
        'platform': 'Windows 10',
        'version': '11.0',
    },
    {
        browserName: 'iphone',
        platform: 'OS X 10.10',
        version: '9.2',
        deviceName: 'iPhone 6 Plus'
    }
];


function runTests(browser){
    var options = {
        host: 'ondemand.saucelabs.com',
        port: 80,
        user: process.env.SAUCE_USER,
        key: process.env.SAUCE_KEY,
        desiredCapabilities: browser,
        // logLevel: 'verbose'
    };
    var name = browser.browserName + ' ' + browser.version;
    var client = webdriverio.remote(options);
    console.log('starting ' + name);
    var timeout = 180*1000;
    client
        .init()
        .url('https://29a.ch/sandbox/2016/normalmap.js/tests/')
        .waitForVisible('.test-results', timeout)
        .element('.test-results-passed')
        .then(function(el){
            console.log(name + ' passed');
        }, function(e){
            console.log(name + ' passed', e);
        })
        .end();
}

browsers.forEach(runTests);
