# grunt-rev-all v0.1.2

> Revision everything possible.

## Details
### Background
Files named according to their contents (MD5) can be cached forever. HTML links must be updated to match the new name in a hierarchy way: if an image changes, then the CSS referencing it is updated, and its MD5 changes so the main HTML reference is changed. 

### Why
Existing MD5-append revisioners are either difficult to configure or are "intelligent" about finding links while missing more obscure Javascript uses of references (Angular template references, JSON referring to images). This tool follows a 'heavy-hammer' approach and rewrites any string that appears to be a path to an existing file in the tree, whether root-based or (multiple-) parent-link (../) based.

## Getting Started
This plugin requires Grunt `~0.4.0`

You may install this plugin with this command:

```shell
npm install grunt-rev-all --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

```js
grunt.loadNpmTasks('grunt-rev-all');
```
### Usage Examples

```js
"grunt-rev-all": {
  // a grouping. Multiple is OK.
  buildAssets: {  

    // What files will be revisioned? (changed in-place)
    src: ["build/**/*"],

    // At HTTP time: Where is the root HTTP folder? 
    root: "build/",

    // Which files (by lower-cased extension) have links to other files? 
    // Ex: excluding images, including a static JSON (for JS to consume) that could have links.
    hasLinks: [".html", ".css", ".js", ".json"],

    // At HTTP time: Where does a file's search path begin? 
    // Ex: JS (in /lib) will path out from build/ (where its HTML is that loaded it).
    // Ex: Angular Views have links relative to the HTML that loads it (build/onboard)
    runtimeBase: {
      "build/": ["build/style/**/*", "build/views/**/*", "build/lib/**/*"],
      "build/onboard/": "build/onboard/views/**/*"
    },

    // also consider a local basepath (for JS's map files)
    lookLocal: ["build/lib/**/*"],

    // Paths linked-to directly or via server config (404.html, etc) should never be renamed.
    // This list should mirror the files that have 'no-cache' set.
    noRev: ["build/index.html", "build/signup.html", "build/login.html"]
  }
}
```

This task supports all the file mapping format Grunt supports (except in hasLinks). Please read [Globbing patterns](http://gruntjs.com/configuring-tasks#globbing-patterns) and [Building the files object dynamically](http://gruntjs.com/configuring-tasks#building-the-files-object-dynamically) for additional details.

```shell
├── Gruntfile.js
└── build/
    ├── index.html
    ├── login.html
    └── lib
        ├── all.min.js
        └── all.min.map
....

```

##### Troubleshooting

The console output indicates general data about files found, links counted, and circular reference processing. 

## Release History

 * 2014-12-01   v0.1.0   Overhauled an internal tool removing the complex-fragile config process.

---

Task submitted by [Andrew Jackson](https://github.com/snadrus)
