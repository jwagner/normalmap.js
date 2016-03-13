#!/bin/sh
version="$1"
if [ -z "$version" ]; then
    echo "Usage: release.sh version"
    exit
fi

echo $version
git checkout release
node -e "p=require('./package.json');p.version='$version';\
require('fs').writeFileSync('package.json', JSON.stringify(p, undefined, '  '));"
node -e "p=require('./bower.json');p.version='$version';\
require('fs').writeFileSync('bower.json', JSON.stringify(p, undefined, '  '));"
gulp zip dist
git diff
echo "Confirm release with YES"
read confirmation
if [ "$confirmation" != 'YES' ]; then
    echo "Ok, maybe not."
    exit
fi
gulp release
git tag -a "v$version"
git push origin "v$version"
npm release
g checkout master
