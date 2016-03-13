#!/bin/sh
version="$1"
if [ -z "$version" ]; then
    echo "Usage: release.sh version"
    exit
fi

echo $version
git checkout release

jq ".version=\"$version\"" < package.json > _package.json
mv _package.json package.json

gulp zip dist
git diff
echo "Confirm release with YES"
read confirmation
if [ "$confirmation" != 'YES' ]; then
    echo "Ok, maybe not."
    exit
fi
git add -f dist/
git commit -am "$version"
gulp release
git tag -a "v$version" -m "release $version"
git push origin "v$version"
npm publish
git checkout master
