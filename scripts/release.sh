#!/bin/sh
version="$1"
if [ -z "$version" ]; then
    echo "Usage: release.sh version"
    exit
fi

echo $version

git checkout --detach

jq ".version=\"$version\"" < package.json > _package.json
mv _package.json package.json

gulp zip dist

git add -f dist/ package.json
git diff
git status
echo "Confirm release with YES"
read confirmation
if [ "$confirmation" != 'YES' ]; then
    echo "Ok, maybe not."
    exit
fi
git commit -am "$version"
gulp release
git tag -a "v$version" -m "release $version"
git push origin "v$version"
npm publish
git checkout master
