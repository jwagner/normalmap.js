# How to contribute

## Reporting Bugs

When reporting a bug please provide all the information needed to quickly reproduce the problem.

This includes:
- The browser & version used
- A screenshot of http://webglreport.com/?v=1
- A URL to reproduce the error
- Other steps other necessary to reproduce the error

If I can't reproduce your problem it will likely not get fixed.

## Contributing Code

### Before Hacking
To avoid wasting your time please communicate before starting to hack.
Creating an issue describing your plans is a good start.

### Before submitting a pull request
- Try to make your code look like the code around it.
- Provide tests where appropriate.
- Run JSHint on the files you changed, fix any issues related to your changes.
- Run the tests, make sure they are green

### Please Avoid
- Reformat my code to fit your personal preferences.

### License
By contributing your code, you agree to license your contribution under the MIT License.

## Setting up the development environment
Before you can start working you'll need to have node.js and git installed.
```
$ git clone
$ cd normalmap.js
$ npm install -g gulp jshint
$ npm install
$ gulp open
```
I work on GNU/Linux. Things might not work on windows.

## Running the tests
There are some simple end to end tests to cover most of the functionality.

You can run them by opening the [/tests/](http://localhost:3000/tests/)
folder after running gulp open.

The tests show the actual output next to the expected output and a diff.

## Code of Conduct
None. Just be who you are.
