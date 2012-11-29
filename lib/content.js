var fs   = require('fs'),
    glob = require('glob'),
    path = require('path'),

    _       = require('underscore'),
    async   = require('async'),
    marked  = require('marked'),
    yaml    = require('libyaml');

// -- Constructor --------------------------------------------------------------
function Content(filename) {
    this.filename = filename;
    this.path     = path.join(this.root, filename);
    this.type     = Content.TYPES[path.extname(filename)];

    this._readMetadata();
}

// -- Static Constants ---------------------------------------------------------

// First match is optional YAML front matter, second is content.
Content.CONTENT_REGEX = /(?:^---\s*?\n([\s\S]+?)\n---\s*?\n)?([\s\S]*)/;

// First match is optional date/time in ISO 8601 format, second is slug.
Content.FILENAME_REGEX = /^(?:(\d{4}-\d{2}-\d{2}(?:T.+?)?)-)?([\w-]+)\./;

// Mapping of file extensions to supported markup types.
Content.TYPES = {
    '.html'    : 'html',
    '.markdown': 'markdown',
    '.md'      : 'markdown'
};

// -- Static Properties --------------------------------------------------------

// Arrays of Content instances, grouped by klass.
Content.items = {};

// Map of slugs to Content instances, grouped by klass.
Content.slugs = {};

// Map of tags to Content instances, grouped by klass.
Content.tags = {};

// -- Static Methods -----------------------------------------------------------
Content.getBySlug = function (klass, slug) {
    var slugs = Content.slugs[klass];
    return slugs && slugs[slug.trim()];
};

Content.recent = function (klass) {
    return Content.items[klass] || [];
};

Content.render = function (items, callback) {
    if (Array.isArray(items)) {
        async.forEach(items, function (item, callback) {
            item.render(callback);
        }, callback);
    } else {
        items.render(callback);
    }
};

Content.prototype = {
    // -- Prototype Properties -------------------------------------------------
    klass: 'content',
    root : path.resolve(__dirname + '/../content'),
    tags : [],
    title: 'Untitled',

    // -- Public Prototype Methods ---------------------------------------------
    render: function (callback) {
        var self = this;

        if (this.html) {
            callback(null, this.html);
            return;
        }

        if (!this.type) {
            callback(Error('Unknown content type for ' + this.path));
            return;
        }

        fs.readFile(this.path, 'utf8', function (err, content) {
            if (err) {
                callback(err);
                return;
            }

            content = content.match(Content.CONTENT_REGEX)[2] || '';

            switch (self.type) {
            case 'html':
                self.html = content;
                break;

            case 'markdown':
                try {
                    self.html = marked(content);
                } catch (ex) {
                    ex.path = self.path;
                    callback(ex);
                    return;
                }
                break;

            default:
                callback(Error('Unknown content type (' + self.type + ') for ' + self.path));
                return;
            }

            callback(null, self.html);
        });
    },

    // -- Protected Prototype Methods ------------------------------------------
    _readMetadata: function () {
        var filenameMatches = this.filename.match(Content.FILENAME_REGEX),
            date            = filenameMatches[1],
            matter          = fs.readFileSync(this.path, 'utf8').match(Content.CONTENT_REGEX)[1],
            slug            = filenameMatches[2];

        // Default to the file creation date if no date is specified in the
        // filename.
        date = date ? new Date(Date.parse(date)) : fs.statSync(this.path).ctime;

        // Slug should never be empty, but just in case it is, give it a default.
        slug || (slug = 'untitled-' + date.toISOString());

        // Parse YAML front matter, if any.
        matter = matter ? yaml.parse(matter)[0] : {};

        // Merge front matter into this post instance.
        _.extend(this, _.defaults(matter, {
            date   : date,
            slug   : slug,
            updated: date
        }));

        // If the date is a string, convert it to a Date instance.
        if (typeof this.date === 'string') {
            this.date = new Date(Date.parse(this.date));
        }

        this.slug = this.slug.trim();

        // Update the slug map.
        var slugMap = Content.slugs[this.klass] || (Content.slugs[this.klass] = {});

        if (slugMap[this.slug]) {
            // Make the slug unique.
            var index   = 1,
                newSlug = this.slug + '-' + index;

            while (slugMap[newSlug]) {
                index  += 1;
                newSlug = this.slug + '-' + index;
            }

            console.error('Warning: ' + this.path + ': slug "' + this.slug + '" is already in use; changing slug to "' + newSlug + '"');

            this.slug = newSlug;
        }

        slugMap[this.slug] = this;

        // Update the tag map.
        var tagMap = Content.tags[this.klass] || (Content.tags[this.klass] = {});

        this.tags.forEach(function (tag) {
            tag = tag.toString().trim().toLowerCase();

            var mapping = tagMap[tag] || (tagMap[tag] = []);
            mapping.push(this);
        }, this);

        // Set this item's URL.
        this.url = '/' + encodeURIComponent(this.klass) + '/' +
            encodeURIComponent(this.slug);
    }
};

// -- Exports ------------------------------------------------------------------
module.exports = Content;