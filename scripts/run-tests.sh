#!/bin/bash
cd $(dirname $0)
source ~/.config/saucelabs.sh
echo $SAUCE_USER
node ./run-tests.js
