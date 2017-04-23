//  Chance.js 1.0.4
//  http://chancejs.com
//  (c) 2013 Victor Quinn
//  Chance may be freely distributed or modified under the MIT license.

(function () {

    // Constants
    var MAX_INT = 9007199254740992;
    var MIN_INT = -MAX_INT;
    var NUMBERS = '0123456789';
    var CHARS_LOWER = 'abcdefghijklmnopqrstuvwxyz';
    var CHARS_UPPER = CHARS_LOWER.toUpperCase();
    var HEX_POOL  = NUMBERS + "abcdef";

    // Cached array helpers
    var slice = Array.prototype.slice;

    // Constructor
    function Chance (seed) {
        if (!(this instanceof Chance)) {
            return seed == null ? new Chance() : new Chance(seed);
        }

        // if user has provided a function, use that as the generator
        if (typeof seed === 'function') {
            this.random = seed;
            return this;
        }

        if (arguments.length) {
            // set a starting value of zero so we can add to it
            this.seed = 0;
        }

        // otherwise, leave this.seed blank so that MT will receive a blank

        for (var i = 0; i < arguments.length; i++) {
            var seedling = 0;
            if (Object.prototype.toString.call(arguments[i]) === '[object String]') {
                for (var j = 0; j < arguments[i].length; j++) {
                    // create a numeric hash for each argument, add to seedling
                    var hash = 0;
                    for (var k = 0; k < arguments[i].length; k++) {
                        hash = arguments[i].charCodeAt(k) + (hash << 6) + (hash << 16) - hash;
                    }
                    seedling += hash;
                }
            } else {
                seedling = arguments[i];
            }
            this.seed += (arguments.length - i) * seedling;
        }

        // If no generator function was provided, use our MT
        this.mt = this.mersenne_twister(this.seed);
        this.bimd5 = this.blueimp_md5();
        this.random = function () {
            return this.mt.random(this.seed);
        };

        return this;
    }

    Chance.prototype.VERSION = "1.0.4";

    // Random helper functions
    function initOptions(options, defaults) {
        options || (options = {});

        if (defaults) {
            for (var i in defaults) {
                if (typeof options[i] === 'undefined') {
                    options[i] = defaults[i];
                }
            }
        }

        return options;
    }

    function testRange(test, errorMessage) {
        if (test) {
            throw new RangeError(errorMessage);
        }
    }

    /**
     * Encode the input string with Base64.
     */
    var base64 = function() {
        throw new Error('No Base64 encoder available.');
    };

    // Select proper Base64 encoder.
    (function determineBase64Encoder() {
        if (typeof btoa === 'function') {
            base64 = btoa;
        } else if (typeof Buffer === 'function') {
            base64 = function(input) {
                return new Buffer(input).toString('base64');
            };
        }
    })();

    // -- Basics --

    /**
     *  Return a random bool, either true or false
     *
     *  @param {Object} [options={ likelihood: 50 }] alter the likelihood of
     *    receiving a true or false value back.
     *  @throws {RangeError} if the likelihood is out of bounds
     *  @returns {Bool} either true or false
     */
    Chance.prototype.bool = function (options) {
        // likelihood of success (true)
        options = initOptions(options, {likelihood : 50});

        // Note, we could get some minor perf optimizations by checking range
        // prior to initializing defaults, but that makes code a bit messier
        // and the check more complicated as we have to check existence of
        // the object then existence of the key before checking constraints.
        // Since the options initialization should be minor computationally,
        // decision made for code cleanliness intentionally. This is mentioned
        // here as it's the first occurrence, will not be mentioned again.
        testRange(
            options.likelihood < 0 || options.likelihood > 100,
            "Chance: Likelihood accepts values from 0 to 100."
        );

        return this.random() * 100 < options.likelihood;
    };

    /**
     *  Return a random character.
     *
     *  @param {Object} [options={}] can specify a character pool, only alpha,
     *    only symbols, and casing (lower or upper)
     *  @returns {String} a single random character
     *  @throws {RangeError} Can only specify alpha or symbols, not both
     */
    Chance.prototype.character = function (options) {
        options = initOptions(options);
        testRange(
            options.alpha && options.symbols,
            "Chance: Cannot specify both alpha and symbols."
        );

        var symbols = "!@#$%^&*()[]",
            letters, pool;

        if (options.casing === 'lower') {
            letters = CHARS_LOWER;
        } else if (options.casing === 'upper') {
            letters = CHARS_UPPER;
        } else {
            letters = CHARS_LOWER + CHARS_UPPER;
        }

        if (options.pool) {
            pool = options.pool;
        } else if (options.alpha) {
            pool = letters;
        } else if (options.symbols) {
            pool = symbols;
        } else {
            pool = letters + NUMBERS + symbols;
        }

        return pool.charAt(this.natural({max: (pool.length - 1)}));
    };

    // Note, wanted to use "float" or "double" but those are both JS reserved words.

    // Note, fixed means N OR LESS digits after the decimal. This because
    // It could be 14.9000 but in JavaScript, when this is cast as a number,
    // the trailing zeroes are dropped. Left to the consumer if trailing zeroes are
    // needed
    /**
     *  Return a random floating point number
     *
     *  @param {Object} [options={}] can specify a fixed precision, min, max
     *  @returns {Number} a single floating point number
     *  @throws {RangeError} Can only specify fixed or precision, not both. Also
     *    min cannot be greater than max
     */
    Chance.prototype.floating = function (options) {
        options = initOptions(options, {fixed : 4});
        testRange(
            options.fixed && options.precision,
            "Chance: Cannot specify both fixed and precision."
        );

        var num;
        var fixed = Math.pow(10, options.fixed);

        var max = MAX_INT / fixed;
        var min = -max;

        testRange(
            options.min && options.fixed && options.min < min,
            "Chance: Min specified is out of range with fixed. Min should be, at least, " + min
        );
        testRange(
            options.max && options.fixed && options.max > max,
            "Chance: Max specified is out of range with fixed. Max should be, at most, " + max
        );

        options = initOptions(options, { min : min, max : max });

        // Todo - Make this work!
        // options.precision = (typeof options.precision !== "undefined") ? options.precision : false;

        num = this.integer({min: options.min * fixed, max: options.max * fixed});
        var num_fixed = (num / fixed).toFixed(options.fixed);

        return parseFloat(num_fixed);
    };

    /**
     *  Return a random integer
     *
     *  NOTE the max and min are INCLUDED in the range. So:
     *  chance.integer({min: 1, max: 3});
     *  would return either 1, 2, or 3.
     *
     *  @param {Object} [options={}] can specify a min and/or max
     *  @returns {Number} a single random integer number
     *  @throws {RangeError} min cannot be greater than max
     */
    Chance.prototype.integer = function (options) {
        // 9007199254740992 (2^53) is the max integer number in JavaScript
        // See: http://vq.io/132sa2j
        options = initOptions(options, {min: MIN_INT, max: MAX_INT});
        testRange(options.min > options.max, "Chance: Min cannot be greater than Max.");

        return Math.floor(this.random() * (options.max - options.min + 1) + options.min);
    };

    /**
     *  Return a random natural
     *
     *  NOTE the max and min are INCLUDED in the range. So:
     *  chance.natural({min: 1, max: 3});
     *  would return either 1, 2, or 3.
     *
     *  @param {Object} [options={}] can specify a min and/or max
     *  @returns {Number} a single random integer number
     *  @throws {RangeError} min cannot be greater than max
     */
    Chance.prototype.natural = function (options) {
        options = initOptions(options, {min: 0, max: MAX_INT});
        testRange(options.min < 0, "Chance: Min cannot be less than zero.");
        return this.integer(options);
    };

    /**
     *  Return a random string
     *
     *  @param {Object} [options={}] can specify a length
     *  @returns {String} a string of random length
     *  @throws {RangeError} length cannot be less than zero
     */
    Chance.prototype.string = function (options) {
        options = initOptions(options, { length: this.natural({min: 5, max: 20}) });
        testRange(options.length < 0, "Chance: Length cannot be less than zero.");
        var length = options.length,
            text = this.n(this.character, length, options);

        return text.join("");
    };

    // -- End Basics --

    // -- Helpers --

    Chance.prototype.capitalize = function (word) {
        return word.charAt(0).toUpperCase() + word.substr(1);
    };

    Chance.prototype.mixin = function (obj) {
        for (var func_name in obj) {
            Chance.prototype[func_name] = obj[func_name];
        }
        return this;
    };

    /**
     *  Given a function that generates something random and a number of items to generate,
     *    return an array of items where none repeat.
     *
     *  @param {Function} fn the function that generates something random
     *  @param {Number} num number of terms to generate
     *  @param {Object} options any options to pass on to the generator function
     *  @returns {Array} an array of length `num` with every item generated by `fn` and unique
     *
     *  There can be more parameters after these. All additional parameters are provided to the given function
     */
    Chance.prototype.unique = function(fn, num, options) {
        testRange(
            typeof fn !== "function",
            "Chance: The first argument must be a function."
        );

        var comparator = function(arr, val) { return arr.indexOf(val) !== -1; };

        if (options) {
            comparator = options.comparator || comparator;
        }

        var arr = [], count = 0, result, MAX_DUPLICATES = num * 50, params = slice.call(arguments, 2);

        while (arr.length < num) {
            var clonedParams = JSON.parse(JSON.stringify(params));
            result = fn.apply(this, clonedParams);
            if (!comparator(arr, result)) {
                arr.push(result);
                // reset count when unique found
                count = 0;
            }

            if (++count > MAX_DUPLICATES) {
                throw new RangeError("Chance: num is likely too large for sample set");
            }
        }
        return arr;
    };

    /**
     *  Gives an array of n random terms
     *
     *  @param {Function} fn the function that generates something random
     *  @param {Number} n number of terms to generate
     *  @returns {Array} an array of length `n` with items generated by `fn`
     *
     *  There can be more parameters after these. All additional parameters are provided to the given function
     */
    Chance.prototype.n = function(fn, n) {
        testRange(
            typeof fn !== "function",
            "Chance: The first argument must be a function."
        );

        if (typeof n === 'undefined') {
            n = 1;
        }
        var i = n, arr = [], params = slice.call(arguments, 2);

        // Providing a negative count should result in a noop.
        i = Math.max( 0, i );

        for (null; i--; null) {
            arr.push(fn.apply(this, params));
        }

        return arr;
    };

    // H/T to SO for this one: http://vq.io/OtUrZ5
    Chance.prototype.pad = function (number, width, pad) {
        // Default pad to 0 if none provided
        pad = pad || '0';
        // Convert number to a string
        number = number + '';
        return number.length >= width ? number : new Array(width - number.length + 1).join(pad) + number;
    };

    // DEPRECATED on 2015-10-01
    Chance.prototype.pick = function (arr, count) {
        if (arr.length === 0) {
            throw new RangeError("Chance: Cannot pick() from an empty array");
        }
        if (!count || count === 1) {
            return arr[this.natural({max: arr.length - 1})];
        } else {
            return this.shuffle(arr).slice(0, count);
        }
    };

    // Given an array, returns a single random element
    Chance.prototype.pickone = function (arr) {
        if (arr.length === 0) {
          throw new RangeError("Chance: Cannot pickone() from an empty array");
        }
        return arr[this.natural({max: arr.length - 1})];
    };

    // Given an array, returns a random set with 'count' elements
    Chance.prototype.pickset = function (arr, count) {
        if (count === 0) {
            return [];
        }
        if (arr.length === 0) {
            throw new RangeError("Chance: Cannot pickset() from an empty array");
        }
        if (count < 0) {
            throw new RangeError("Chance: count must be positive number");
        }
        if (!count || count === 1) {
            return [ this.pickone(arr) ];
        } else {
            return this.shuffle(arr).slice(0, count);
        }
    };

    Chance.prototype.shuffle = function (arr) {
        var old_array = arr.slice(0),
            new_array = [],
            j = 0,
            length = Number(old_array.length);

        for (var i = 0; i < length; i++) {
            // Pick a random index from the array
            j = this.natural({max: old_array.length - 1});
            // Add it to the new array
            new_array[i] = old_array[j];
            // Remove that element from the original array
            old_array.splice(j, 1);
        }

        return new_array;
    };

    // Returns a single item from an array with relative weighting of odds
    Chance.prototype.weighted = function (arr, weights, trim) {
        if (arr.length !== weights.length) {
            throw new RangeError("Chance: length of array and weights must match");
        }

        // scan weights array and sum valid entries
        var sum = 0;
        var val;
        for (var weightIndex = 0; weightIndex < weights.length; ++weightIndex) {
            val = weights[weightIndex];
            if (val > 0) {
                sum += val;
            }
        }

        if (sum === 0) {
            throw new RangeError("Chance: no valid entries in array weights");
        }

        // select a value within range
        var selected = this.random() * sum;

        // find array entry corresponding to selected value
        var total = 0;
        var lastGoodIdx = -1;
        var chosenIdx;
        for (weightIndex = 0; weightIndex < weights.length; ++weightIndex) {
            val = weights[weightIndex];
            total += val;
            if (val > 0) {
                if (selected <= total) {
                    chosenIdx = weightIndex;
                    break;
                }
                lastGoodIdx = weightIndex;
            }

            // handle any possible rounding error comparison to ensure something is picked
            if (weightIndex === (weights.length - 1)) {
                chosenIdx = lastGoodIdx;
            }
        }

        var chosen = arr[chosenIdx];
        trim = (typeof trim === 'undefined') ? false : trim;
        if (trim) {
            arr.splice(chosenIdx, 1);
            weights.splice(chosenIdx, 1);
        }

        return chosen;
    };

    // -- End Helpers --

    // -- Text --

    Chance.prototype.paragraph = function (options) {
        options = initOptions(options);

        var sentences = options.sentences || this.natural({min: 3, max: 7}),
            sentence_array = this.n(this.sentence, sentences);

        return sentence_array.join(' ');
    };

    // Could get smarter about this than generating random words and
    // chaining them together. Such as: http://vq.io/1a5ceOh
    Chance.prototype.sentence = function (options) {
        options = initOptions(options);

        var words = options.words || this.natural({min: 12, max: 18}),
            punctuation = options.punctuation,
            text, word_array = this.n(this.word, words);

        text = word_array.join(' ');

        // Capitalize first letter of sentence
        text = this.capitalize(text);

        // Make sure punctuation has a usable value
        if (punctuation !== false && !/^[\.\?;!:]$/.test(punctuation)) {
            punctuation = '.';
        }

        // Add punctuation mark
        if (punctuation) {
            text += punctuation;
        }

        return text;
    };

    Chance.prototype.syllable = function (options) {
        options = initOptions(options);

        var length = options.length || this.natural({min: 2, max: 3}),
            consonants = 'bcdfghjklmnprstvwz', // consonants except hard to speak ones
            vowels = 'aeiou', // vowels
            all = consonants + vowels, // all
            text = '',
            chr;

        // I'm sure there's a more elegant way to do this, but this works
        // decently well.
        for (var i = 0; i < length; i++) {
            if (i === 0) {
                // First character can be anything
                chr = this.character({pool: all});
            } else if (consonants.indexOf(chr) === -1) {
                // Last character was a vowel, now we want a consonant
                chr = this.character({pool: consonants});
            } else {
                // Last character was a consonant, now we want a vowel
                chr = this.character({pool: vowels});
            }

            text += chr;
        }

        if (options.capitalize) {
            text = this.capitalize(text);
        }

        return text;
    };

    Chance.prototype.word = function (options) {
        options = initOptions(options);

        testRange(
            options.syllables && options.length,
            "Chance: Cannot specify both syllables AND length."
        );

        var syllables = options.syllables || this.natural({min: 1, max: 3}),
            text = '';

        if (options.length) {
            // Either bound word by length
            do {
                text += this.syllable();
            } while (text.length < options.length);
            text = text.substring(0, options.length);
        } else {
            // Or by number of syllables
            for (var i = 0; i < syllables; i++) {
                text += this.syllable();
            }
        }

        if (options.capitalize) {
            text = this.capitalize(text);
        }

        return text;
    };

    // -- End Text --

    // -- Person --

    Chance.prototype.age = function (options) {
        options = initOptions(options);
        var ageRange;

        switch (options.type) {
            case 'child':
                ageRange = {min: 0, max: 12};
                break;
            case 'teen':
                ageRange = {min: 13, max: 19};
                break;
            case 'adult':
                ageRange = {min: 18, max: 65};
                break;
            case 'senior':
                ageRange = {min: 65, max: 100};
                break;
            case 'all':
                ageRange = {min: 0, max: 100};
                break;
            default:
                ageRange = {min: 18, max: 65};
                break;
        }

        return this.natural(ageRange);
    };

    Chance.prototype.birthday = function (options) {
        var age = this.age(options);
        var currentYear = new Date().getFullYear();

        if (options && options.type) {
            var min = new Date();
            var max = new Date();
            min.setFullYear(currentYear - age - 1);
            max.setFullYear(currentYear - age);

            options = initOptions(options, {
                min: min,
                max: max
            });
        } else {
            options = initOptions(options, {
                year: currentYear - age
            });
        }

        return this.date(options);
    };

    // CPF; ID to identify taxpayers in Brazil
    Chance.prototype.cpf = function (options) {
        options = initOptions(options, {
            formatted: true
        });

        var n = this.n(this.natural, 9, { max: 9 });
        var d1 = n[8]*2+n[7]*3+n[6]*4+n[5]*5+n[4]*6+n[3]*7+n[2]*8+n[1]*9+n[0]*10;
        d1 = 11 - (d1 % 11);
        if (d1>=10) {
            d1 = 0;
        }
        var d2 = d1*2+n[8]*3+n[7]*4+n[6]*5+n[5]*6+n[4]*7+n[3]*8+n[2]*9+n[1]*10+n[0]*11;
        d2 = 11 - (d2 % 11);
        if (d2>=10) {
            d2 = 0;
        }
        var cpf = ''+n[0]+n[1]+n[2]+'.'+n[3]+n[4]+n[5]+'.'+n[6]+n[7]+n[8]+'-'+d1+d2;
        return options.formatted ? cpf : cpf.replace(/\D/g,'');
    };

    // CNPJ: ID to identify companies in Brazil
    Chance.prototype.cnpj = function (options) {
        options = initOptions(options, {
            formatted: true
        });

        var n = this.n(this.natural, 12, { max: 12 });
        var d1 = n[11]*2+n[10]*3+n[9]*4+n[8]*5+n[7]*6+n[6]*7+n[5]*8+n[4]*9+n[3]*2+n[2]*3+n[1]*4+n[0]*5;
        d1 = 11 - (d1 % 11);
        if (d1<2) {
            d1 = 0;
        }
        var d2 = d1*2+n[11]*3+n[10]*4+n[9]*5+n[8]*6+n[7]*7+n[6]*8+n[5]*9+n[4]*2+n[3]*3+n[2]*4+n[1]*5+n[0]*6;
        d2 = 11 - (d2 % 11);
        if (d2<2) {
            d2 = 0;
        }
        var cnpj = ''+n[0]+n[1]+'.'+n[2]+n[3]+n[4]+'.'+n[5]+n[6]+n[7]+'/'+n[8]+n[9]+n[10]+n[11]+'-'+d1+d2;
        return options.formatted ? cnpj : cnpj.replace(/\D/g,'');
    };

    Chance.prototype.first = function (options) {
        options = initOptions(options, {gender: this.gender(), nationality: 'en'});
        return this.pick(this.get("firstNames")[options.gender.toLowerCase()][options.nationality.toLowerCase()]);
    };

    Chance.prototype.gender = function (options) {
        options = initOptions(options, {extraGenders: []});
        return this.pick(['Male', 'Female'].concat(options.extraGenders));
    };

    Chance.prototype.last = function (options) {
        options = initOptions(options, {nationality: 'en'});
        return this.pick(this.get("lastNames")[options.nationality.toLowerCase()]);
    };

    Chance.prototype.israelId=function(){
        var x=this.string({pool: '0123456789',length:8});
        var y=0;
        for (var i=0;i<x.length;i++){
            var thisDigit=  x[i] *  (i/2===parseInt(i/2) ? 1 : 2);
            thisDigit=this.pad(thisDigit,2).toString();
            thisDigit=parseInt(thisDigit[0]) + parseInt(thisDigit[1]);
            y=y+thisDigit;
        }
        x=x+(10-parseInt(y.toString().slice(-1))).toString().slice(-1);
        return x;
    };

    Chance.prototype.mrz = function (options) {
        var checkDigit = function (input) {
            var alpha = "<ABCDEFGHIJKLMNOPQRSTUVWXYXZ".split(''),
                multipliers = [ 7, 3, 1 ],
                runningTotal = 0;

            if (typeof input !== 'string') {
                input = input.toString();
            }

            input.split('').forEach(function(character, idx) {
                var pos = alpha.indexOf(character);

                if(pos !== -1) {
                    character = pos === 0 ? 0 : pos + 9;
                } else {
                    character = parseInt(character, 10);
                }
                character *= multipliers[idx % multipliers.length];
                runningTotal += character;
            });
            return runningTotal % 10;
        };
        var generate = function (opts) {
            var pad = function (length) {
                return new Array(length + 1).join('<');
            };
            var number = [ 'P<',
                           opts.issuer,
                           opts.last.toUpperCase(),
                           '<<',
                           opts.first.toUpperCase(),
                           pad(39 - (opts.last.length + opts.first.length + 2)),
                           opts.passportNumber,
                           checkDigit(opts.passportNumber),
                           opts.nationality,
                           opts.dob,
                           checkDigit(opts.dob),
                           opts.gender,
                           opts.expiry,
                           checkDigit(opts.expiry),
                           pad(14),
                           checkDigit(pad(14)) ].join('');

            return number +
                (checkDigit(number.substr(44, 10) +
                            number.substr(57, 7) +
                            number.substr(65, 7)));
        };

        var that = this;

        options = initOptions(options, {
            first: this.first(),
            last: this.last(),
            passportNumber: this.integer({min: 100000000, max: 999999999}),
            dob: (function () {
                var date = that.birthday({type: 'adult'});
                return [date.getFullYear().toString().substr(2),
                        that.pad(date.getMonth() + 1, 2),
                        that.pad(date.getDate(), 2)].join('');
            }()),
            expiry: (function () {
                var date = new Date();
                return [(date.getFullYear() + 5).toString().substr(2),
                        that.pad(date.getMonth() + 1, 2),
                        that.pad(date.getDate(), 2)].join('');
            }()),
            gender: this.gender() === 'Female' ? 'F': 'M',
            issuer: 'GBR',
            nationality: 'GBR'
        });
        return generate (options);
    };

    Chance.prototype.name = function (options) {
        options = initOptions(options);

        var first = this.first(options),
            last = this.last(options),
            name;

        if (options.middle) {
            name = first + ' ' + this.first(options) + ' ' + last;
        } else if (options.middle_initial) {
            name = first + ' ' + this.character({alpha: true, casing: 'upper'}) + '. ' + last;
        } else {
            name = first + ' ' + last;
        }

        if (options.prefix) {
            name = this.prefix(options) + ' ' + name;
        }

        if (options.suffix) {
            name = name + ' ' + this.suffix(options);
        }

        return name;
    };

    // Return the list of available name prefixes based on supplied gender.
    // @todo introduce internationalization
    Chance.prototype.name_prefixes = function (gender) {
        gender = gender || "all";
        gender = gender.toLowerCase();

        var prefixes = [
            { name: 'Doctor', abbreviation: 'Dr.' }
        ];

        if (gender === "male" || gender === "all") {
            prefixes.push({ name: 'Mister', abbreviation: 'Mr.' });
        }

        if (gender === "female" || gender === "all") {
            prefixes.push({ name: 'Miss', abbreviation: 'Miss' });
            prefixes.push({ name: 'Misses', abbreviation: 'Mrs.' });
        }

        return prefixes;
    };

    // Alias for name_prefix
    Chance.prototype.prefix = function (options) {
        return this.name_prefix(options);
    };

    Chance.prototype.name_prefix = function (options) {
        options = initOptions(options, { gender: "all" });
        return options.full ?
            this.pick(this.name_prefixes(options.gender)).name :
            this.pick(this.name_prefixes(options.gender)).abbreviation;
    };
    //Hungarian ID number
    Chance.prototype.HIDN= function(){
     //Hungarian ID nuber structure: XXXXXXYY (X=number,Y=Capital Latin letter)
      var idn_pool="0123456789";
      var idn_chrs="ABCDEFGHIJKLMNOPQRSTUVWXYXZ";
      var idn="";
        idn+=this.string({pool:idn_pool,length:6});
        idn+=this.string({pool:idn_chrs,length:2});
        return idn;
    };


    Chance.prototype.ssn = function (options) {
        options = initOptions(options, {ssnFour: false, dashes: true});
        var ssn_pool = "1234567890",
            ssn,
            dash = options.dashes ? '-' : '';

        if(!options.ssnFour) {
            ssn = this.string({pool: ssn_pool, length: 3}) + dash +
            this.string({pool: ssn_pool, length: 2}) + dash +
            this.string({pool: ssn_pool, length: 4});
        } else {
            ssn = this.string({pool: ssn_pool, length: 4});
        }
        return ssn;
    };

    // Return the list of available name suffixes
    // @todo introduce internationalization
    Chance.prototype.name_suffixes = function () {
        var suffixes = [
            { name: 'Doctor of Osteopathic Medicine', abbreviation: 'D.O.' },
            { name: 'Doctor of Philosophy', abbreviation: 'Ph.D.' },
            { name: 'Esquire', abbreviation: 'Esq.' },
            { name: 'Junior', abbreviation: 'Jr.' },
            { name: 'Juris Doctor', abbreviation: 'J.D.' },
            { name: 'Master of Arts', abbreviation: 'M.A.' },
            { name: 'Master of Business Administration', abbreviation: 'M.B.A.' },
            { name: 'Master of Science', abbreviation: 'M.S.' },
            { name: 'Medical Doctor', abbreviation: 'M.D.' },
            { name: 'Senior', abbreviation: 'Sr.' },
            { name: 'The Third', abbreviation: 'III' },
            { name: 'The Fourth', abbreviation: 'IV' },
            { name: 'Bachelor of Engineering', abbreviation: 'B.E' },
            { name: 'Bachelor of Technology', abbreviation: 'B.TECH' }
        ];
        return suffixes;
    };

    // Alias for name_suffix
    Chance.prototype.suffix = function (options) {
        return this.name_suffix(options);
    };

    Chance.prototype.name_suffix = function (options) {
        options = initOptions(options);
        return options.full ?
            this.pick(this.name_suffixes()).name :
            this.pick(this.name_suffixes()).abbreviation;
    };

    Chance.prototype.nationalities = function () {
        return this.get("nationalities");
    };

    // Generate random nationality based on json list
    Chance.prototype.nationality = function () {
        var nationality = this.pick(this.nationalities());
        return nationality.name;
    };

    // -- End Person --

    // -- Mobile --
    // Android GCM Registration ID
    Chance.prototype.android_id = function () {
        return "APA91" + this.string({ pool: "0123456789abcefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_", length: 178 });
    };

    // Apple Push Token
    Chance.prototype.apple_token = function () {
        return this.string({ pool: "abcdef1234567890", length: 64 });
    };

    // Windows Phone 8 ANID2
    Chance.prototype.wp8_anid2 = function () {
        return base64( this.hash( { length : 32 } ) );
    };

    // Windows Phone 7 ANID
    Chance.prototype.wp7_anid = function () {
        return 'A=' + this.guid().replace(/-/g, '').toUpperCase() + '&E=' + this.hash({ length:3 }) + '&W=' + this.integer({ min:0, max:9 });
    };

    // BlackBerry Device PIN
    Chance.prototype.bb_pin = function () {
        return this.hash({ length: 8 });
    };

    // -- End Mobile --

    // -- Web --
    Chance.prototype.avatar = function (options) {
        var url = null;
        var URL_BASE = '//www.gravatar.com/avatar/';
        var PROTOCOLS = {
            http: 'http',
            https: 'https'
        };
        var FILE_TYPES = {
            bmp: 'bmp',
            gif: 'gif',
            jpg: 'jpg',
            png: 'png'
        };
        var FALLBACKS = {
            '404': '404', // Return 404 if not found
            mm: 'mm', // Mystery man
            identicon: 'identicon', // Geometric pattern based on hash
            monsterid: 'monsterid', // A generated monster icon
            wavatar: 'wavatar', // A generated face
            retro: 'retro', // 8-bit icon
            blank: 'blank' // A transparent png
        };
        var RATINGS = {
            g: 'g',
            pg: 'pg',
            r: 'r',
            x: 'x'
        };
        var opts = {
            protocol: null,
            email: null,
            fileExtension: null,
            size: null,
            fallback: null,
            rating: null
        };

        if (!options) {
            // Set to a random email
            opts.email = this.email();
            options = {};
        }
        else if (typeof options === 'string') {
            opts.email = options;
            options = {};
        }
        else if (typeof options !== 'object') {
            return null;
        }
        else if (options.constructor === 'Array') {
            return null;
        }

        opts = initOptions(options, opts);

        if (!opts.email) {
            // Set to a random email
            opts.email = this.email();
        }

        // Safe checking for params
        opts.protocol = PROTOCOLS[opts.protocol] ? opts.protocol + ':' : '';
        opts.size = parseInt(opts.size, 0) ? opts.size : '';
        opts.rating = RATINGS[opts.rating] ? opts.rating : '';
        opts.fallback = FALLBACKS[opts.fallback] ? opts.fallback : '';
        opts.fileExtension = FILE_TYPES[opts.fileExtension] ? opts.fileExtension : '';

        url =
            opts.protocol +
            URL_BASE +
            this.bimd5.md5(opts.email) +
            (opts.fileExtension ? '.' + opts.fileExtension : '') +
            (opts.size || opts.rating || opts.fallback ? '?' : '') +
            (opts.size ? '&s=' + opts.size.toString() : '') +
            (opts.rating ? '&r=' + opts.rating : '') +
            (opts.fallback ? '&d=' + opts.fallback : '')
            ;

        return url;
    };

    /**
     * #Description:
     * ===============================================
     * Generate random color value base on color type:
     * -> hex
     * -> rgb
     * -> rgba
     * -> 0x
     * -> named color
     *
     * #Examples:
     * ===============================================
     * * Geerate random hex color
     * chance.color() => '#79c157' / 'rgb(110,52,164)' / '0x67ae0b' / '#e2e2e2' / '#29CFA7'
     *
     * * Generate Hex based color value
     * chance.color({format: 'hex'})    => '#d67118'
     *
     * * Generate simple rgb value
     * chance.color({format: 'rgb'})    => 'rgb(110,52,164)'
     *
     * * Generate Ox based color value
     * chance.color({format: '0x'})     => '0x67ae0b'
     *
     * * Generate graiscale based value
     * chance.color({grayscale: true})  => '#e2e2e2'
     *
     * * Return valide color name
     * chance.color({format: 'name'})   => 'red'
     *
     * * Make color uppercase
     * chance.color({casing: 'upper'})  => '#29CFA7'
     *
     * @param  [object] options
     * @return [string] color value
     */
    Chance.prototype.color = function (options) {

        function gray(value, delimiter) {
            return [value, value, value].join(delimiter || '');
        }

        function rgb(hasAlpha) {

            var rgbValue    = (hasAlpha)    ? 'rgba' : 'rgb';
            var alphaChanal = (hasAlpha)    ? (',' + this.floating({min:0, max:1})) : "";
            var colorValue  = (isGrayscale) ? (gray(this.natural({max: 255}), ',')) : (this.natural({max: 255}) + ',' + this.natural({max: 255}) + ',' + this.natural({max: 255}));

            return rgbValue + '(' + colorValue + alphaChanal + ')';
        }

        function hex(start, end, withHash) {

            var simbol = (withHash) ? "#" : "";
            var expression  = (isGrayscale ? gray(this.hash({length: start})) : this.hash({length: end}));
            return simbol + expression;
        }

        options = initOptions(options, {
            format: this.pick(['hex', 'shorthex', 'rgb', 'rgba', '0x', 'name']),
            grayscale: false,
            casing: 'lower'
        });

        var isGrayscale = options.grayscale;
        var colorValue;

        if (options.format === 'hex') {
            colorValue =  hex.call(this, 2, 6, true);
        }
        else if (options.format === 'shorthex') {
            colorValue = hex.call(this, 1, 3, true);
        }
        else if (options.format === 'rgb') {
            colorValue = rgb.call(this, false);
        }
        else if (options.format === 'rgba') {
            colorValue = rgb.call(this, true);
        }
        else if (options.format === '0x') {
            colorValue = '0x' + hex.call(this, 2, 6);
        }
        else if(options.format === 'name') {
            return this.pick(this.get("colorNames"));
        }
        else {
            throw new RangeError('Invalid format provided. Please provide one of "hex", "shorthex", "rgb", "rgba", "0x" or "name".');
        }

        if (options.casing === 'upper' ) {
            colorValue = colorValue.toUpperCase();
        }

        return colorValue;
    };

    Chance.prototype.domain = function (options) {
        options = initOptions(options);
        return this.word() + '.' + (options.tld || this.tld());
    };

    Chance.prototype.email = function (options) {
        options = initOptions(options);
        return this.word({length: options.length}) + '@' + (options.domain || this.domain());
    };

    Chance.prototype.fbid = function () {
        return parseInt('10000' + this.natural({max: 100000000000}), 10);
    };

    Chance.prototype.google_analytics = function () {
        var account = this.pad(this.natural({max: 999999}), 6);
        var property = this.pad(this.natural({max: 99}), 2);

        return 'UA-' + account + '-' + property;
    };

    Chance.prototype.hashtag = function () {
        return '#' + this.word();
    };

    Chance.prototype.ip = function () {
        // Todo: This could return some reserved IPs. See http://vq.io/137dgYy
        // this should probably be updated to account for that rare as it may be
        return this.natural({min: 1, max: 254}) + '.' +
               this.natural({max: 255}) + '.' +
               this.natural({max: 255}) + '.' +
               this.natural({min: 1, max: 254});
    };

    Chance.prototype.ipv6 = function () {
        var ip_addr = this.n(this.hash, 8, {length: 4});

        return ip_addr.join(":");
    };

    Chance.prototype.klout = function () {
        return this.natural({min: 1, max: 99});
    };

    Chance.prototype.semver = function (options) {
        options = initOptions(options, { include_prerelease: true });

        var range = this.pickone(["^", "~", "<", ">", "<=", ">=", "="]);
        if (options.range) {
            range = options.range;
        }

        var prerelease = "";
        if (options.include_prerelease) {
            prerelease = this.weighted(["", "-dev", "-beta", "-alpha"], [50, 10, 5, 1]);
        }
        return range + this.rpg('3d10').join('.') + prerelease;
    };

    Chance.prototype.tlds = function () {
        return ['com', 'org', 'edu', 'gov', 'co.uk', 'net', 'io', 'ac', 'ad', 'ae', 'af', 'ag', 'ai', 'al', 'am', 'an', 'ao', 'aq', 'ar', 'as', 'at', 'au', 'aw', 'ax', 'az', 'ba', 'bb', 'bd', 'be', 'bf', 'bg', 'bh', 'bi', 'bj', 'bm', 'bn', 'bo', 'bq', 'br', 'bs', 'bt', 'bv', 'bw', 'by', 'bz', 'ca', 'cc', 'cd', 'cf', 'cg', 'ch', 'ci', 'ck', 'cl', 'cm', 'cn', 'co', 'cr', 'cu', 'cv', 'cw', 'cx', 'cy', 'cz', 'de', 'dj', 'dk', 'dm', 'do', 'dz', 'ec', 'ee', 'eg', 'eh', 'er', 'es', 'et', 'eu', 'fi', 'fj', 'fk', 'fm', 'fo', 'fr', 'ga', 'gb', 'gd', 'ge', 'gf', 'gg', 'gh', 'gi', 'gl', 'gm', 'gn', 'gp', 'gq', 'gr', 'gs', 'gt', 'gu', 'gw', 'gy', 'hk', 'hm', 'hn', 'hr', 'ht', 'hu', 'id', 'ie', 'il', 'im', 'in', 'io', 'iq', 'ir', 'is', 'it', 'je', 'jm', 'jo', 'jp', 'ke', 'kg', 'kh', 'ki', 'km', 'kn', 'kp', 'kr', 'kw', 'ky', 'kz', 'la', 'lb', 'lc', 'li', 'lk', 'lr', 'ls', 'lt', 'lu', 'lv', 'ly', 'ma', 'mc', 'md', 'me', 'mg', 'mh', 'mk', 'ml', 'mm', 'mn', 'mo', 'mp', 'mq', 'mr', 'ms', 'mt', 'mu', 'mv', 'mw', 'mx', 'my', 'mz', 'na', 'nc', 'ne', 'nf', 'ng', 'ni', 'nl', 'no', 'np', 'nr', 'nu', 'nz', 'om', 'pa', 'pe', 'pf', 'pg', 'ph', 'pk', 'pl', 'pm', 'pn', 'pr', 'ps', 'pt', 'pw', 'py', 'qa', 're', 'ro', 'rs', 'ru', 'rw', 'sa', 'sb', 'sc', 'sd', 'se', 'sg', 'sh', 'si', 'sj', 'sk', 'sl', 'sm', 'sn', 'so', 'sr', 'ss', 'st', 'su', 'sv', 'sx', 'sy', 'sz', 'tc', 'td', 'tf', 'tg', 'th', 'tj', 'tk', 'tl', 'tm', 'tn', 'to', 'tp', 'tr', 'tt', 'tv', 'tw', 'tz', 'ua', 'ug', 'uk', 'us', 'uy', 'uz', 'va', 'vc', 've', 'vg', 'vi', 'vn', 'vu', 'wf', 'ws', 'ye', 'yt', 'za', 'zm', 'zw'];
    };

    Chance.prototype.tld = function () {
        return this.pick(this.tlds());
    };

    Chance.prototype.twitter = function () {
        return '@' + this.word();
    };

    Chance.prototype.url = function (options) {
        options = initOptions(options, { protocol: "http", domain: this.domain(options), domain_prefix: "", path: this.word(), extensions: []});

        var extension = options.extensions.length > 0 ? "." + this.pick(options.extensions) : "";
        var domain = options.domain_prefix ? options.domain_prefix + "." + options.domain : options.domain;

        return options.protocol + "://" + domain + "/" + options.path + extension;
    };

    Chance.prototype.port = function() {
        return this.integer({min: 0, max: 65535});
    };

    // -- End Web --

    // -- Location --

    Chance.prototype.address = function (options) {
        options = initOptions(options);
        return this.natural({min: 5, max: 2000}) + ' ' + this.street(options);
    };

    Chance.prototype.altitude = function (options) {
        options = initOptions(options, {fixed: 5, min: 0, max: 8848});
        return this.floating({
            min: options.min,
            max: options.max,
            fixed: options.fixed
        });
    };

    Chance.prototype.areacode = function (options) {
        options = initOptions(options, {parens : true});
        // Don't want area codes to start with 1, or have a 9 as the second digit
        var areacode = this.natural({min: 2, max: 9}).toString() +
                this.natural({min: 0, max: 8}).toString() +
                this.natural({min: 0, max: 9}).toString();

        return options.parens ? '(' + areacode + ')' : areacode;
    };

    Chance.prototype.city = function () {
        return this.capitalize(this.word({syllables: 3}));
    };

    Chance.prototype.coordinates = function (options) {
        return this.latitude(options) + ', ' + this.longitude(options);
    };

    Chance.prototype.countries = function () {
        return this.get("countries");
    };

    Chance.prototype.country = function (options) {
        options = initOptions(options);
        var country = this.pick(this.countries());
        return options.full ? country.name : country.abbreviation;
    };

    Chance.prototype.depth = function (options) {
        options = initOptions(options, {fixed: 5, min: -10994, max: 0});
        return this.floating({
            min: options.min,
            max: options.max,
            fixed: options.fixed
        });
    };

    Chance.prototype.geohash = function (options) {
        options = initOptions(options, { length: 7 });
        return this.string({ length: options.length, pool: '0123456789bcdefghjkmnpqrstuvwxyz' });
    };

    Chance.prototype.geojson = function (options) {
        return this.latitude(options) + ', ' + this.longitude(options) + ', ' + this.altitude(options);
    };

    Chance.prototype.latitude = function (options) {
        options = initOptions(options, {fixed: 5, min: -90, max: 90});
        return this.floating({min: options.min, max: options.max, fixed: options.fixed});
    };

    Chance.prototype.longitude = function (options) {
        options = initOptions(options, {fixed: 5, min: -180, max: 180});
        return this.floating({min: options.min, max: options.max, fixed: options.fixed});
    };

    Chance.prototype.phone = function (options) {
        var self = this,
            numPick,
            ukNum = function (parts) {
                var section = [];
                //fills the section part of the phone number with random numbers.
                parts.sections.forEach(function(n) {
                    section.push(self.string({ pool: '0123456789', length: n}));
                });
                return parts.area + section.join(' ');
            };
        options = initOptions(options, {
            formatted: true,
            country: 'us',
            mobile: false
        });
        if (!options.formatted) {
            options.parens = false;
        }
        var phone;
        switch (options.country) {
            case 'fr':
                if (!options.mobile) {
                    numPick = this.pick([
                        // Valid zone and département codes.
                        '01' + this.pick(['30', '34', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '53', '55', '56', '58', '60', '64', '69', '70', '72', '73', '74', '75', '76', '77', '78', '79', '80', '81', '82', '83']) + self.string({ pool: '0123456789', length: 6}),
                        '02' + this.pick(['14', '18', '22', '23', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '40', '41', '43', '44', '45', '46', '47', '48', '49', '50', '51', '52', '53', '54', '56', '57', '61', '62', '69', '72', '76', '77', '78', '85', '90', '96', '97', '98', '99']) + self.string({ pool: '0123456789', length: 6}),
                        '03' + this.pick(['10', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '39', '44', '45', '51', '52', '54', '55', '57', '58', '59', '60', '61', '62', '63', '64', '65', '66', '67', '68', '69', '70', '71', '72', '73', '80', '81', '82', '83', '84', '85', '86', '87', '88', '89', '90']) + self.string({ pool: '0123456789', length: 6}),
                        '04' + this.pick(['11', '13', '15', '20', '22', '26', '27', '30', '32', '34', '37', '42', '43', '44', '50', '56', '57', '63', '66', '67', '68', '69', '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '80', '81', '82', '83', '84', '85', '86', '88', '89', '90', '91', '92', '93', '94', '95', '97', '98']) + self.string({ pool: '0123456789', length: 6}),
                        '05' + this.pick(['08', '16', '17', '19', '24', '31', '32', '33', '34', '35', '40', '45', '46', '47', '49', '53', '55', '56', '57', '58', '59', '61', '62', '63', '64', '65', '67', '79', '81', '82', '86', '87', '90', '94']) + self.string({ pool: '0123456789', length: 6}),
                        '09' + self.string({ pool: '0123456789', length: 8}),
                    ]);
                    phone = options.formatted ? numPick.match(/../g).join(' ') : numPick;
                } else {
                    numPick = this.pick(['06', '07']) + self.string({ pool: '0123456789', length: 8});
                    phone = options.formatted ? numPick.match(/../g).join(' ') : numPick;
                }
                break;
            case 'uk':
                if (!options.mobile) {
                    numPick = this.pick([
                        //valid area codes of major cities/counties followed by random numbers in required format.
                        { area: '01' + this.character({ pool: '234569' }) + '1 ', sections: [3,4] },
                        { area: '020 ' + this.character({ pool: '378' }), sections: [3,4] },
                        { area: '023 ' + this.character({ pool: '89' }), sections: [3,4] },
                        { area: '024 7', sections: [3,4] },
                        { area: '028 ' + this.pick(['25','28','37','71','82','90','92','95']), sections: [2,4] },
                        { area: '012' + this.pick(['04','08','54','76','97','98']) + ' ', sections: [6] },
                        { area: '013' + this.pick(['63','64','84','86']) + ' ', sections: [6] },
                        { area: '014' + this.pick(['04','20','60','61','80','88']) + ' ', sections: [6] },
                        { area: '015' + this.pick(['24','27','62','66']) + ' ', sections: [6] },
                        { area: '016' + this.pick(['06','29','35','47','59','95']) + ' ', sections: [6] },
                        { area: '017' + this.pick(['26','44','50','68']) + ' ', sections: [6] },
                        { area: '018' + this.pick(['27','37','84','97']) + ' ', sections: [6] },
                        { area: '019' + this.pick(['00','05','35','46','49','63','95']) + ' ', sections: [6] }
                    ]);
                    phone = options.formatted ? ukNum(numPick) : ukNum(numPick).replace(' ', '', 'g');
                } else {
                    numPick = this.pick([
                        { area: '07' + this.pick(['4','5','7','8','9']), sections: [2,6] },
                        { area: '07624 ', sections: [6] }
                    ]);
                    phone = options.formatted ? ukNum(numPick) : ukNum(numPick).replace(' ', '');
                }
                break;
            case 'us':
                var areacode = this.areacode(options).toString();
                var exchange = this.natural({ min: 2, max: 9 }).toString() +
                    this.natural({ min: 0, max: 9 }).toString() +
                    this.natural({ min: 0, max: 9 }).toString();
                var subscriber = this.natural({ min: 1000, max: 9999 }).toString(); // this could be random [0-9]{4}
                phone = options.formatted ? areacode + ' ' + exchange + '-' + subscriber : areacode + exchange + subscriber;
        }
        return phone;
    };

    Chance.prototype.postal = function () {
        // Postal District
        var pd = this.character({pool: "XVTSRPNKLMHJGECBA"});
        // Forward Sortation Area (FSA)
        var fsa = pd + this.natural({max: 9}) + this.character({alpha: true, casing: "upper"});
        // Local Delivery Unut (LDU)
        var ldu = this.natural({max: 9}) + this.character({alpha: true, casing: "upper"}) + this.natural({max: 9});

        return fsa + " " + ldu;
    };

    Chance.prototype.counties = function (options) {
        options = initOptions(options, { country: 'uk' });
        return this.get("counties")[options.country.toLowerCase()];
    };

    Chance.prototype.county = function (options) {
        return this.pick(this.counties(options)).name;
    };

    Chance.prototype.provinces = function (options) {
        options = initOptions(options, { country: 'ca' });
        return this.get("provinces")[options.country.toLowerCase()];
    };

    Chance.prototype.province = function (options) {
        return (options && options.full) ?
            this.pick(this.provinces(options)).name :
            this.pick(this.provinces(options)).abbreviation;
    };

    Chance.prototype.state = function (options) {
        return (options && options.full) ?
            this.pick(this.states(options)).name :
            this.pick(this.states(options)).abbreviation;
    };

    Chance.prototype.states = function (options) {
        options = initOptions(options, { country: 'us', us_states_and_dc: true } );

        var states;

        switch (options.country.toLowerCase()) {
            case 'us':
                var us_states_and_dc = this.get("us_states_and_dc"),
                    territories = this.get("territories"),
                    armed_forces = this.get("armed_forces");

                states = [];

                if (options.us_states_and_dc) {
                    states = states.concat(us_states_and_dc);
                }
                if (options.territories) {
                    states = states.concat(territories);
                }
                if (options.armed_forces) {
                    states = states.concat(armed_forces);
                }
                break;
            case 'it':
                states = this.get("country_regions")[options.country.toLowerCase()];
                break;
            case 'uk':
                states = this.get("counties")[options.country.toLowerCase()];
                break;
        }

        return states;
    };

    Chance.prototype.street = function (options) {
        options = initOptions(options, { country: 'us', syllables: 2 });
        var     street;

        switch (options.country.toLowerCase()) {
            case 'us':
                street = this.word({ syllables: options.syllables });
                street = this.capitalize(street);
                street += ' ';
                street += options.short_suffix ?
                    this.street_suffix(options).abbreviation :
                    this.street_suffix(options).name;
                break;
            case 'it':
                street = this.word({ syllables: options.syllables });
                street = this.capitalize(street);
                street = (options.short_suffix ?
                    this.street_suffix(options).abbreviation :
                    this.street_suffix(options).name) + " " + street;
                break;
        }
        return street;
    };

    Chance.prototype.street_suffix = function (options) {
        options = initOptions(options, { country: 'us' });
        return this.pick(this.street_suffixes(options));
    };

    Chance.prototype.street_suffixes = function (options) {
        options = initOptions(options, { country: 'us' });
        // These are the most common suffixes.
        return this.get("street_suffixes")[options.country.toLowerCase()];
    };

    // Note: only returning US zip codes, internationalization will be a whole
    // other beast to tackle at some point.
    Chance.prototype.zip = function (options) {
        var zip = this.n(this.natural, 5, {max: 9});

        if (options && options.plusfour === true) {
            zip.push('-');
            zip = zip.concat(this.n(this.natural, 4, {max: 9}));
        }

        return zip.join("");
    };

    // -- End Location --

    // -- Time

    Chance.prototype.ampm = function () {
        return this.bool() ? 'am' : 'pm';
    };

    Chance.prototype.date = function (options) {
        var date_string, date;

        // If interval is specified we ignore preset
        if(options && (options.min || options.max)) {
            options = initOptions(options, {
                american: true,
                string: false
            });
            var min = typeof options.min !== "undefined" ? options.min.getTime() : 1;
            // 100,000,000 days measured relative to midnight at the beginning of 01 January, 1970 UTC. http://es5.github.io/#x15.9.1.1
            var max = typeof options.max !== "undefined" ? options.max.getTime() : 8640000000000000;

            date = new Date(this.integer({min: min, max: max}));
        } else {
            var m = this.month({raw: true});
            var daysInMonth = m.days;

            if(options && options.month) {
                // Mod 12 to allow months outside range of 0-11 (not encouraged, but also not prevented).
                daysInMonth = this.get('months')[((options.month % 12) + 12) % 12].days;
            }

            options = initOptions(options, {
                year: parseInt(this.year(), 10),
                // Necessary to subtract 1 because Date() 0-indexes month but not day or year
                // for some reason.
                month: m.numeric - 1,
                day: this.natural({min: 1, max: daysInMonth}),
                hour: this.hour({twentyfour: true}),
                minute: this.minute(),
                second: this.second(),
                millisecond: this.millisecond(),
                american: true,
                string: false
            });

            date = new Date(options.year, options.month, options.day, options.hour, options.minute, options.second, options.millisecond);
        }

        if (options.american) {
            // Adding 1 to the month is necessary because Date() 0-indexes
            // months but not day for some odd reason.
            date_string = (date.getMonth() + 1) + '/' + date.getDate() + '/' + date.getFullYear();
        } else {
            date_string = date.getDate() + '/' + (date.getMonth() + 1) + '/' + date.getFullYear();
        }

        return options.string ? date_string : date;
    };

    Chance.prototype.hammertime = function (options) {
        return this.date(options).getTime();
    };

    Chance.prototype.hour = function (options) {
        options = initOptions(options, {
            min: options && options.twentyfour ? 0 : 1,
            max: options && options.twentyfour ? 23 : 12
        });

        testRange(options.min < 0, "Chance: Min cannot be less than 0.");
        testRange(options.twentyfour && options.max > 23, "Chance: Max cannot be greater than 23 for twentyfour option.");
        testRange(!options.twentyfour && options.max > 12, "Chance: Max cannot be greater than 12.");
        testRange(options.min > options.max, "Chance: Min cannot be greater than Max.");

        return this.natural({min: options.min, max: options.max});
    };

    Chance.prototype.millisecond = function () {
        return this.natural({max: 999});
    };

    Chance.prototype.minute = Chance.prototype.second = function (options) {
        options = initOptions(options, {min: 0, max: 59});

        testRange(options.min < 0, "Chance: Min cannot be less than 0.");
        testRange(options.max > 59, "Chance: Max cannot be greater than 59.");
        testRange(options.min > options.max, "Chance: Min cannot be greater than Max.");

        return this.natural({min: options.min, max: options.max});
    };

    Chance.prototype.month = function (options) {
        options = initOptions(options, {min: 1, max: 12});

        testRange(options.min < 1, "Chance: Min cannot be less than 1.");
        testRange(options.max > 12, "Chance: Max cannot be greater than 12.");
        testRange(options.min > options.max, "Chance: Min cannot be greater than Max.");

        var month = this.pick(this.months().slice(options.min - 1, options.max));
        return options.raw ? month : month.name;
    };

    Chance.prototype.months = function () {
        return this.get("months");
    };

    Chance.prototype.second = function () {
        return this.natural({max: 59});
    };

    Chance.prototype.timestamp = function () {
        return this.natural({min: 1, max: parseInt(new Date().getTime() / 1000, 10)});
    };

    Chance.prototype.weekday = function (options) {
        options = initOptions(options, {weekday_only: false});
        var weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
        if (!options.weekday_only) {
            weekdays.push("Saturday");
            weekdays.push("Sunday");
        }
        return this.pickone(weekdays);
    };

    Chance.prototype.year = function (options) {
        // Default to current year as min if none specified
        options = initOptions(options, {min: new Date().getFullYear()});

        // Default to one century after current year as max if none specified
        options.max = (typeof options.max !== "undefined") ? options.max : options.min + 100;

        return this.natural(options).toString();
    };

    // -- End Time

    // -- Finance --

    Chance.prototype.cc = function (options) {
        options = initOptions(options);

        var type, number, to_generate;

        type = (options.type) ?
                    this.cc_type({ name: options.type, raw: true }) :
                    this.cc_type({ raw: true });

        number = type.prefix.split("");
        to_generate = type.length - type.prefix.length - 1;

        // Generates n - 1 digits
        number = number.concat(this.n(this.integer, to_generate, {min: 0, max: 9}));

        // Generates the last digit according to Luhn algorithm
        number.push(this.luhn_calculate(number.join("")));

        return number.join("");
    };

    Chance.prototype.cc_types = function () {
        // http://en.wikipedia.org/wiki/Bank_card_number#Issuer_identification_number_.28IIN.29
        return this.get("cc_types");
    };

    Chance.prototype.cc_type = function (options) {
        options = initOptions(options);
        var types = this.cc_types(),
            type = null;

        if (options.name) {
            for (var i = 0; i < types.length; i++) {
                // Accept either name or short_name to specify card type
                if (types[i].name === options.name || types[i].short_name === options.name) {
                    type = types[i];
                    break;
                }
            }
            if (type === null) {
                throw new RangeError("Credit card type '" + options.name + "'' is not supported");
            }
        } else {
            type = this.pick(types);
        }

        return options.raw ? type : type.name;
    };

    //return all world currency by ISO 4217
    Chance.prototype.currency_types = function () {
        return this.get("currency_types");
    };

    //return random world currency by ISO 4217
    Chance.prototype.currency = function () {
        return this.pick(this.currency_types());
    };

    //return all timezones availabel
    Chance.prototype.timezones = function () {
        return this.get("timezones");
    };

    //return random timezone
    Chance.prototype.timezone = function () {
        return this.pick(this.timezones());
    };

    //Return random correct currency exchange pair (e.g. EUR/USD) or array of currency code
    Chance.prototype.currency_pair = function (returnAsString) {
        var currencies = this.unique(this.currency, 2, {
            comparator: function(arr, val) {

                return arr.reduce(function(acc, item) {
                    // If a match has been found, short circuit check and just return
                    return acc || (item.code === val.code);
                }, false);
            }
        });

        if (returnAsString) {
            return currencies[0].code + '/' + currencies[1].code;
        } else {
            return currencies;
        }
    };

    Chance.prototype.dollar = function (options) {
        // By default, a somewhat more sane max for dollar than all available numbers
        options = initOptions(options, {max : 10000, min : 0});

        var dollar = this.floating({min: options.min, max: options.max, fixed: 2}).toString(),
            cents = dollar.split('.')[1];

        if (cents === undefined) {
            dollar += '.00';
        } else if (cents.length < 2) {
            dollar = dollar + '0';
        }

        if (dollar < 0) {
            return '-$' + dollar.replace('-', '');
        } else {
            return '$' + dollar;
        }
    };

    Chance.prototype.euro = function (options) {
        return Number(this.dollar(options).replace("$", "")).toLocaleString() + "€";
    };

    Chance.prototype.exp = function (options) {
        options = initOptions(options);
        var exp = {};

        exp.year = this.exp_year();

        // If the year is this year, need to ensure month is greater than the
        // current month or this expiration will not be valid
        if (exp.year === (new Date().getFullYear()).toString()) {
            exp.month = this.exp_month({future: true});
        } else {
            exp.month = this.exp_month();
        }

        return options.raw ? exp : exp.month + '/' + exp.year;
    };

    Chance.prototype.exp_month = function (options) {
        options = initOptions(options);
        var month, month_int,
            // Date object months are 0 indexed
            curMonth = new Date().getMonth() + 1;

        if (options.future && (curMonth !== 12)) {
            do {
                month = this.month({raw: true}).numeric;
                month_int = parseInt(month, 10);
            } while (month_int <= curMonth);
        } else {
            month = this.month({raw: true}).numeric;
        }

        return month;
    };

    Chance.prototype.exp_year = function () {
        var curMonth = new Date().getMonth() + 1,
            curYear = new Date().getFullYear();

        return this.year({min: ((curMonth === 12) ? (curYear + 1) : curYear), max: (curYear + 10)});
    };

    Chance.prototype.vat = function (options) {
        options = initOptions(options, { country: 'it' });
        switch (options.country.toLowerCase()) {
            case 'it':
                return this.it_vat();
        }
    };

    // -- End Finance

    // -- Regional

    Chance.prototype.it_vat = function () {
        var it_vat = this.natural({min: 1, max: 1800000});

        it_vat = this.pad(it_vat, 7) + this.pad(this.pick(this.provinces({ country: 'it' })).code, 3);
        return it_vat + this.luhn_calculate(it_vat);
    };

    /*
     * this generator is written following the official algorithm
     * all data can be passed explicitely or randomized by calling chance.cf() without options
     * the code does not check that the input data is valid (it goes beyond the scope of the generator)
     *
     * @param  [Object] options = { first: first name,
     *                              last: last name,
     *                              gender: female|male,
                                    birthday: JavaScript date object,
                                    city: string(4), 1 letter + 3 numbers
                                   }
     * @return [string] codice fiscale
     *
    */
    Chance.prototype.cf = function (options) {
        options = options || {};
        var gender = !!options.gender ? options.gender : this.gender(),
            first = !!options.first ? options.first : this.first( { gender: gender, nationality: 'it'} ),
            last = !!options.last ? options.last : this.last( { nationality: 'it'} ),
            birthday = !!options.birthday ? options.birthday : this.birthday(),
            city = !!options.city ? options.city : this.pickone(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'L', 'M', 'Z']) + this.pad(this.natural({max:999}), 3),
            cf = [],
            name_generator = function(name, isLast) {
                var temp,
                    return_value = [];

                if (name.length < 3) {
                    return_value = name.split("").concat("XXX".split("")).splice(0,3);
                }
                else {
                    temp = name.toUpperCase().split('').map(function(c){
                        return ("BCDFGHJKLMNPRSTVWZ".indexOf(c) !== -1) ? c : undefined;
                    }).join('');
                    if (temp.length > 3) {
                        if (isLast) {
                            temp = temp.substr(0,3);
                        } else {
                            temp = temp[0] + temp.substr(2,2);
                        }
                    }
                    if (temp.length < 3) {
                        return_value = temp;
                        temp = name.toUpperCase().split('').map(function(c){
                            return ("AEIOU".indexOf(c) !== -1) ? c : undefined;
                        }).join('').substr(0, 3 - return_value.length);
                    }
                    return_value = return_value + temp;
                }

                return return_value;
            },
            date_generator = function(birthday, gender, that) {
                var lettermonths = ['A', 'B', 'C', 'D', 'E', 'H', 'L', 'M', 'P', 'R', 'S', 'T'];

                return  birthday.getFullYear().toString().substr(2) +
                        lettermonths[birthday.getMonth()] +
                        that.pad(birthday.getDate() + ((gender.toLowerCase() === "female") ? 40 : 0), 2);
            },
            checkdigit_generator = function(cf) {
                var range1 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                    range2 = "ABCDEFGHIJABCDEFGHIJKLMNOPQRSTUVWXYZ",
                    evens  = "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                    odds   = "BAKPLCQDREVOSFTGUHMINJWZYX",
                    digit  = 0;


                for(var i = 0; i < 15; i++) {
                    if (i % 2 !== 0) {
                        digit += evens.indexOf(range2[range1.indexOf(cf[i])]);
                    }
                    else {
                        digit +=  odds.indexOf(range2[range1.indexOf(cf[i])]);
                    }
                }
                return evens[digit % 26];
            };

        cf = cf.concat(name_generator(last, true), name_generator(first), date_generator(birthday, gender, this), city.toUpperCase().split("")).join("");
        cf += checkdigit_generator(cf.toUpperCase(), this);

        return cf.toUpperCase();
    };

    Chance.prototype.pl_pesel = function () {
        var number = this.natural({min: 1, max: 9999999999});
        var arr = this.pad(number, 10).split('');
        for (var i = 0; i < arr.length; i++) {
            arr[i] = parseInt(arr[i]);
        }

        var controlNumber = (1 * arr[0] + 3 * arr[1] + 7 * arr[2] + 9 * arr[3] + 1 * arr[4] + 3 * arr[5] + 7 * arr[6] + 9 * arr[7] + 1 * arr[8] + 3 * arr[9]) % 10;
        if(controlNumber !== 0) {
            controlNumber = 10 - controlNumber;
        }

        return arr.join('') + controlNumber;
    };

    Chance.prototype.pl_nip = function () {
        var number = this.natural({min: 1, max: 999999999});
        var arr = this.pad(number, 9).split('');
        for (var i = 0; i < arr.length; i++) {
            arr[i] = parseInt(arr[i]);
        }

        var controlNumber = (6 * arr[0] + 5 * arr[1] + 7 * arr[2] + 2 * arr[3] + 3 * arr[4] + 4 * arr[5] + 5 * arr[6] + 6 * arr[7] + 7 * arr[8]) % 11;
        if(controlNumber === 10) {
            return this.pl_nip();
        }

        return arr.join('') + controlNumber;
    };

    Chance.prototype.pl_regon = function () {
        var number = this.natural({min: 1, max: 99999999});
        var arr = this.pad(number, 8).split('');
        for (var i = 0; i < arr.length; i++) {
            arr[i] = parseInt(arr[i]);
        }

        var controlNumber = (8 * arr[0] + 9 * arr[1] + 2 * arr[2] + 3 * arr[3] + 4 * arr[4] + 5 * arr[5] + 6 * arr[6] + 7 * arr[7]) % 11;
        if(controlNumber === 10) {
            controlNumber = 0;
        }

        return arr.join('') + controlNumber;
    };

    // -- End Regional

    // -- Miscellaneous --

    // Dice - For all the board game geeks out there, myself included ;)
    function diceFn (range) {
        return function () {
            return this.natural(range);
        };
    }
    Chance.prototype.d4 = diceFn({min: 1, max: 4});
    Chance.prototype.d6 = diceFn({min: 1, max: 6});
    Chance.prototype.d8 = diceFn({min: 1, max: 8});
    Chance.prototype.d10 = diceFn({min: 1, max: 10});
    Chance.prototype.d12 = diceFn({min: 1, max: 12});
    Chance.prototype.d20 = diceFn({min: 1, max: 20});
    Chance.prototype.d30 = diceFn({min: 1, max: 30});
    Chance.prototype.d100 = diceFn({min: 1, max: 100});

    Chance.prototype.rpg = function (thrown, options) {
        options = initOptions(options);
        if (!thrown) {
            throw new RangeError("A type of die roll must be included");
        } else {
            var bits = thrown.toLowerCase().split("d"),
                rolls = [];

            if (bits.length !== 2 || !parseInt(bits[0], 10) || !parseInt(bits[1], 10)) {
                throw new Error("Invalid format provided. Please provide #d# where the first # is the number of dice to roll, the second # is the max of each die");
            }
            for (var i = bits[0]; i > 0; i--) {
                rolls[i - 1] = this.natural({min: 1, max: bits[1]});
            }
            return (typeof options.sum !== 'undefined' && options.sum) ? rolls.reduce(function (p, c) { return p + c; }) : rolls;
        }
    };

    // Guid
    Chance.prototype.guid = function (options) {
        options = initOptions(options, { version: 5 });

        var guid_pool = "abcdef1234567890",
            variant_pool = "ab89",
            guid = this.string({ pool: guid_pool, length: 8 }) + '-' +
                   this.string({ pool: guid_pool, length: 4 }) + '-' +
                   // The Version
                   options.version +
                   this.string({ pool: guid_pool, length: 3 }) + '-' +
                   // The Variant
                   this.string({ pool: variant_pool, length: 1 }) +
                   this.string({ pool: guid_pool, length: 3 }) + '-' +
                   this.string({ pool: guid_pool, length: 12 });
        return guid;
    };

    // Hash
    Chance.prototype.hash = function (options) {
        options = initOptions(options, {length : 40, casing: 'lower'});
        var pool = options.casing === 'upper' ? HEX_POOL.toUpperCase() : HEX_POOL;
        return this.string({pool: pool, length: options.length});
    };

    Chance.prototype.luhn_check = function (num) {
        var str = num.toString();
        var checkDigit = +str.substring(str.length - 1);
        return checkDigit === this.luhn_calculate(+str.substring(0, str.length - 1));
    };

    Chance.prototype.luhn_calculate = function (num) {
        var digits = num.toString().split("").reverse();
        var sum = 0;
        var digit;

        for (var i = 0, l = digits.length; l > i; ++i) {
            digit = +digits[i];
            if (i % 2 === 0) {
                digit *= 2;
                if (digit > 9) {
                    digit -= 9;
                }
            }
            sum += digit;
        }
        return (sum * 9) % 10;
    };

    // MD5 Hash
    Chance.prototype.md5 = function(options) {
        var opts = { str: '', key: null, raw: false };

        if (!options) {
            opts.str = this.string();
            options = {};
        }
        else if (typeof options === 'string') {
            opts.str = options;
            options = {};
        }
        else if (typeof options !== 'object') {
            return null;
        }
        else if(options.constructor === 'Array') {
            return null;
        }

        opts = initOptions(options, opts);

        if(!opts.str){
            throw new Error('A parameter is required to return an md5 hash.');
        }

        return this.bimd5.md5(opts.str, opts.key, opts.raw);
    };

    /**
     * #Description:
     * =====================================================
     * Generate random file name with extention
     *
     * The argument provide extention type
     * -> raster
     * -> vector
     * -> 3d
     * -> document
     *
     * If noting is provided the function return random file name with random
     * extention type of any kind
     *
     * The user can validate the file name length range
     * If noting provided the generated file name is radom
     *
     * #Extention Pool :
     * * Currently the supported extentions are
     *  -> some of the most popular raster image extentions
     *  -> some of the most popular vector image extentions
     *  -> some of the most popular 3d image extentions
     *  -> some of the most popular document extentions
     *
     * #Examples :
     * =====================================================
     *
     * Return random file name with random extention. The file extention
     * is provided by a predifined collection of extentions. More abouth the extention
     * pool can be fond in #Extention Pool section
     *
     * chance.file()
     * => dsfsdhjf.xml
     *
     * In order to generate a file name with sspecific length, specify the
     * length property and integer value. The extention is going to be random
     *
     * chance.file({length : 10})
     * => asrtineqos.pdf
     *
     * In order to geerate file with extention form some of the predifined groups
     * of the extention pool just specify the extenton pool category in fileType property
     *
     * chance.file({fileType : 'raster'})
     * => dshgssds.psd
     *
     * You can provide specific extention for your files
     * chance.file({extention : 'html'})
     * => djfsd.html
     *
     * Or you could pass custom collection of extentons bt array or by object
     * chance.file({extentions : [...]})
     * => dhgsdsd.psd
     *
     * chance.file({extentions : { key : [...], key : [...]}})
     * => djsfksdjsd.xml
     *
     * @param  [collection] options
     * @return [string]
     *
     */
    Chance.prototype.file = function(options) {

        var fileOptions = options || {};
        var poolCollectionKey = "fileExtension";
        var typeRange   = Object.keys(this.get("fileExtension"));//['raster', 'vector', '3d', 'document'];
        var fileName;
        var fileExtention;

        // Generate random file name
        fileName = this.word({length : fileOptions.length});

        // Generate file by specific extention provided by the user
        if(fileOptions.extention) {

            fileExtention = fileOptions.extention;
            return (fileName + '.' + fileExtention);
        }

        // Generate file by specific axtention collection
        if(fileOptions.extentions) {

            if(Array.isArray(fileOptions.extentions)) {

                fileExtention = this.pickone(fileOptions.extentions);
                return (fileName + '.' + fileExtention);
            }
            else if(fileOptions.extentions.constructor === Object) {

                var extentionObjectCollection = fileOptions.extentions;
                var keys = Object.keys(extentionObjectCollection);

                fileExtention = this.pickone(extentionObjectCollection[this.pickone(keys)]);
                return (fileName + '.' + fileExtention);
            }

            throw new Error("Expect collection of type Array or Object to be passed as an argument ");
        }

        // Generate file extention based on specific file type
        if(fileOptions.fileType) {

            var fileType = fileOptions.fileType;
            if(typeRange.indexOf(fileType) !== -1) {

                fileExtention = this.pickone(this.get(poolCollectionKey)[fileType]);
                return (fileName + '.' + fileExtention);
            }

            throw new Error("Expect file type value to be 'raster', 'vector', '3d' or 'document' ");
        }

        // Generate random file name if no extenton options are passed
        fileExtention = this.pickone(this.get(poolCollectionKey)[this.pickone(typeRange)]);
        return (fileName + '.' + fileExtention);
    };

    var data = {

        firstNames: {
            "male": {
                "en": ["James", "John", "Robert", "Michael", "William", "David", "Richard", "Joseph", "Charles", "Thomas", "Christopher", "Daniel", "Matthew", "George", "Donald", "Anthony", "Paul", "Mark", "Edward", "Steven", "Kenneth", "Andrew", "Brian", "Joshua", "Kevin", "Ronald", "Timothy", "Jason", "Jeffrey", "Frank", "Gary", "Ryan", "Nicholas", "Eric", "Stephen", "Jacob", "Larry", "Jonathan", "Scott", "Raymond", "Justin", "Brandon", "Gregory", "Samuel", "Benjamin", "Patrick", "Jack", "Henry", "Walter", "Dennis", "Jerry", "Alexander", "Peter", "Tyler", "Douglas", "Harold", "Aaron", "Jose", "Adam", "Arthur", "Zachary", "Carl", "Nathan", "Albert", "Kyle", "Lawrence", "Joe", "Willie", "Gerald", "Roger", "Keith", "Jeremy", "Terry", "Harry", "Ralph", "Sean", "Jesse", "Roy", "Louis", "Billy", "Austin", "Bruce", "Eugene", "Christian", "Bryan", "Wayne", "Russell", "Howard", "Fred", "Ethan", "Jordan", "Philip", "Alan", "Juan", "Randy", "Vincent", "Bobby", "Dylan", "Johnny", "Phillip", "Victor", "Clarence", "Ernest", "Martin", "Craig", "Stanley", "Shawn", "Travis", "Bradley", "Leonard", "Earl", "Gabriel", "Jimmy", "Francis", "Todd", "Noah", "Danny", "Dale", "Cody", "Carlos", "Allen", "Frederick", "Logan", "Curtis", "Alex", "Joel", "Luis", "Norman", "Marvin", "Glenn", "Tony", "Nathaniel", "Rodney", "Melvin", "Alfred", "Steve", "Cameron", "Chad", "Edwin", "Caleb", "Evan", "Antonio", "Lee", "Herbert", "Jeffery", "Isaac", "Derek", "Ricky", "Marcus", "Theodore", "Elijah", "Luke", "Jesus", "Eddie", "Troy", "Mike", "Dustin", "Ray", "Adrian", "Bernard", "Leroy", "Angel", "Randall", "Wesley", "Ian", "Jared", "Mason", "Hunter", "Calvin", "Oscar", "Clifford", "Jay", "Shane", "Ronnie", "Barry", "Lucas", "Corey", "Manuel", "Leo", "Tommy", "Warren", "Jackson", "Isaiah", "Connor", "Don", "Dean", "Jon", "Julian", "Miguel", "Bill", "Lloyd", "Charlie", "Mitchell", "Leon", "Jerome", "Darrell", "Jeremiah", "Alvin", "Brett", "Seth", "Floyd", "Jim", "Blake", "Micheal", "Gordon", "Trevor", "Lewis", "Erik", "Edgar", "Vernon", "Devin", "Gavin", "Jayden", "Chris", "Clyde", "Tom", "Derrick", "Mario", "Brent", "Marc", "Herman", "Chase", "Dominic", "Ricardo", "Franklin", "Maurice", "Max", "Aiden", "Owen", "Lester", "Gilbert", "Elmer", "Gene", "Francisco", "Glen", "Cory", "Garrett", "Clayton", "Sam", "Jorge", "Chester", "Alejandro", "Jeff", "Harvey", "Milton", "Cole", "Ivan", "Andre", "Duane", "Landon"],
                // Data taken from http://www.dati.gov.it/dataset/comune-di-firenze_0163
                "it": ["Adolfo", "Alberto", "Aldo", "Alessandro", "Alessio", "Alfredo", "Alvaro", "Andrea", "Angelo", "Angiolo", "Antonino", "Antonio", "Attilio", "Benito", "Bernardo", "Bruno", "Carlo", "Cesare", "Christian", "Claudio", "Corrado", "Cosimo", "Cristian", "Cristiano", "Daniele", "Dario", "David", "Davide", "Diego", "Dino", "Domenico", "Duccio", "Edoardo", "Elia", "Elio", "Emanuele", "Emiliano", "Emilio", "Enrico", "Enzo", "Ettore", "Fabio", "Fabrizio", "Federico", "Ferdinando", "Fernando", "Filippo", "Francesco", "Franco", "Gabriele", "Giacomo", "Giampaolo", "Giampiero", "Giancarlo", "Gianfranco", "Gianluca", "Gianmarco", "Gianni", "Gino", "Giorgio", "Giovanni", "Giuliano", "Giulio", "Giuseppe", "Graziano", "Gregorio", "Guido", "Iacopo", "Jacopo", "Lapo", "Leonardo", "Lorenzo", "Luca", "Luciano", "Luigi", "Manuel", "Marcello", "Marco", "Marino", "Mario", "Massimiliano", "Massimo", "Matteo", "Mattia", "Maurizio", "Mauro", "Michele", "Mirko", "Mohamed", "Nello", "Neri", "Niccolò", "Nicola", "Osvaldo", "Otello", "Paolo", "Pier Luigi", "Piero", "Pietro", "Raffaele", "Remo", "Renato", "Renzo", "Riccardo", "Roberto", "Rolando", "Romano", "Salvatore", "Samuele", "Sandro", "Sergio", "Silvano", "Simone", "Stefano", "Thomas", "Tommaso", "Ubaldo", "Ugo", "Umberto", "Valerio", "Valter", "Vasco", "Vincenzo", "Vittorio"],
                "ru": ["Александр", "Алексей", "Анатолий", "Андрей", "Борис", "Валерий", "Василий", "Виктор", "Виталий", "Владимир", "Геннадий", "Георгий", "Григорий", "Денис", "Дмитрий", "Евгений", "Иван", "Игорь", "Илья", "Константин", "Максим", "Михаил", "Никита", "Николай", "Олег", "Павел", "Петр", "Роман", "Сергей", "Степан", "Федор", "Юрий"]
            },
            "female": {
                "en": ["Mary", "Emma", "Elizabeth", "Minnie", "Margaret", "Ida", "Alice", "Bertha", "Sarah", "Annie", "Clara", "Ella", "Florence", "Cora", "Martha", "Laura", "Nellie", "Grace", "Carrie", "Maude", "Mabel", "Bessie", "Jennie", "Gertrude", "Julia", "Hattie", "Edith", "Mattie", "Rose", "Catherine", "Lillian", "Ada", "Lillie", "Helen", "Jessie", "Louise", "Ethel", "Lula", "Myrtle", "Eva", "Frances", "Lena", "Lucy", "Edna", "Maggie", "Pearl", "Daisy", "Fannie", "Josephine", "Dora", "Rosa", "Katherine", "Agnes", "Marie", "Nora", "May", "Mamie", "Blanche", "Stella", "Ellen", "Nancy", "Effie", "Sallie", "Nettie", "Della", "Lizzie", "Flora", "Susie", "Maud", "Mae", "Etta", "Harriet", "Sadie", "Caroline", "Katie", "Lydia", "Elsie", "Kate", "Susan", "Mollie", "Alma", "Addie", "Georgia", "Eliza", "Lulu", "Nannie", "Lottie", "Amanda", "Belle", "Charlotte", "Rebecca", "Ruth", "Viola", "Olive", "Amelia", "Hannah", "Jane", "Virginia", "Emily", "Matilda", "Irene", "Kathryn", "Esther", "Willie", "Henrietta", "Ollie", "Amy", "Rachel", "Sara", "Estella", "Theresa", "Augusta", "Ora", "Pauline", "Josie", "Lola", "Sophia", "Leona", "Anne", "Mildred", "Ann", "Beulah", "Callie", "Lou", "Delia", "Eleanor", "Barbara", "Iva", "Louisa", "Maria", "Mayme", "Evelyn", "Estelle", "Nina", "Betty", "Marion", "Bettie", "Dorothy", "Luella", "Inez", "Lela", "Rosie", "Allie", "Millie", "Janie", "Cornelia", "Victoria", "Ruby", "Winifred", "Alta", "Celia", "Christine", "Beatrice", "Birdie", "Harriett", "Mable", "Myra", "Sophie", "Tillie", "Isabel", "Sylvia", "Carolyn", "Isabelle", "Leila", "Sally", "Ina", "Essie", "Bertie", "Nell", "Alberta", "Katharine", "Lora", "Rena", "Mina", "Rhoda", "Mathilda", "Abbie", "Eula", "Dollie", "Hettie", "Eunice", "Fanny", "Ola", "Lenora", "Adelaide", "Christina", "Lelia", "Nelle", "Sue", "Johanna", "Lilly", "Lucinda", "Minerva", "Lettie", "Roxie", "Cynthia", "Helena", "Hilda", "Hulda", "Bernice", "Genevieve", "Jean", "Cordelia", "Marian", "Francis", "Jeanette", "Adeline", "Gussie", "Leah", "Lois", "Lura", "Mittie", "Hallie", "Isabella", "Olga", "Phoebe", "Teresa", "Hester", "Lida", "Lina", "Winnie", "Claudia", "Marguerite", "Vera", "Cecelia", "Bess", "Emilie", "John", "Rosetta", "Verna", "Myrtie", "Cecilia", "Elva", "Olivia", "Ophelia", "Georgie", "Elnora", "Violet", "Adele", "Lily", "Linnie", "Loretta", "Madge", "Polly", "Virgie", "Eugenia", "Lucile", "Lucille", "Mabelle", "Rosalie"],
                // Data taken from http://www.dati.gov.it/dataset/comune-di-firenze_0162
                "it": ["Ada", "Adriana", "Alessandra", "Alessia", "Alice", "Angela", "Anna", "Anna Maria", "Annalisa", "Annita", "Annunziata", "Antonella", "Arianna", "Asia", "Assunta", "Aurora", "Barbara", "Beatrice", "Benedetta", "Bianca", "Bruna", "Camilla", "Carla", "Carlotta", "Carmela", "Carolina", "Caterina", "Catia", "Cecilia", "Chiara", "Cinzia", "Clara", "Claudia", "Costanza", "Cristina", "Daniela", "Debora", "Diletta", "Dina", "Donatella", "Elena", "Eleonora", "Elisa", "Elisabetta", "Emanuela", "Emma", "Eva", "Federica", "Fernanda", "Fiorella", "Fiorenza", "Flora", "Franca", "Francesca", "Gabriella", "Gaia", "Gemma", "Giada", "Gianna", "Gina", "Ginevra", "Giorgia", "Giovanna", "Giulia", "Giuliana", "Giuseppa", "Giuseppina", "Grazia", "Graziella", "Greta", "Ida", "Ilaria", "Ines", "Iolanda", "Irene", "Irma", "Isabella", "Jessica", "Laura", "Leda", "Letizia", "Licia", "Lidia", "Liliana", "Lina", "Linda", "Lisa", "Livia", "Loretta", "Luana", "Lucia", "Luciana", "Lucrezia", "Luisa", "Manuela", "Mara", "Marcella", "Margherita", "Maria", "Maria Cristina", "Maria Grazia", "Maria Luisa", "Maria Pia", "Maria Teresa", "Marina", "Marisa", "Marta", "Martina", "Marzia", "Matilde", "Melissa", "Michela", "Milena", "Mirella", "Monica", "Natalina", "Nella", "Nicoletta", "Noemi", "Olga", "Paola", "Patrizia", "Piera", "Pierina", "Raffaella", "Rebecca", "Renata", "Rina", "Rita", "Roberta", "Rosa", "Rosanna", "Rossana", "Rossella", "Sabrina", "Sandra", "Sara", "Serena", "Silvana", "Silvia", "Simona", "Simonetta", "Sofia", "Sonia", "Stefania", "Susanna", "Teresa", "Tina", "Tiziana", "Tosca", "Valentina", "Valeria", "Vanda", "Vanessa", "Vanna", "Vera", "Veronica", "Vilma", "Viola", "Virginia", "Vittoria"],
                "ru": ["Агриппина", "Александра", "Анастасия", "Анна", "Антонина", "Валентина", "Вера", "Виктория", "Галина", "Дарья", "Евдокия", "Екатерина", "Елена", "Елизавета", "Зоя", "Ирина", "Клавдия", "Кристина", "Лариса", "Лидия", "Любовь", "Людмила", "Марина", "Мария", "Надежда", "Наталья", "Нина", "Оксана", "Ольга", "Параскева", "Пелагия", "Раиса", "Светлана", "Тамара", "Татьяна", "Юлия"]
            }
        },

        lastNames: {
            "en": ['Smith', 'Johnson', 'Williams', 'Jones', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson', 'Garcia', 'Martinez', 'Robinson', 'Clark', 'Rodriguez', 'Lewis', 'Lee', 'Walker', 'Hall', 'Allen', 'Young', 'Hernandez', 'King', 'Wright', 'Lopez', 'Hill', 'Scott', 'Green', 'Adams', 'Baker', 'Gonzalez', 'Nelson', 'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Sanchez', 'Morris', 'Rogers', 'Reed', 'Cook', 'Morgan', 'Bell', 'Murphy', 'Bailey', 'Rivera', 'Cooper', 'Richardson', 'Cox', 'Howard', 'Ward', 'Torres', 'Peterson', 'Gray', 'Ramirez', 'James', 'Watson', 'Brooks', 'Kelly', 'Sanders', 'Price', 'Bennett', 'Wood', 'Barnes', 'Ross', 'Henderson', 'Coleman', 'Jenkins', 'Perry', 'Powell', 'Long', 'Patterson', 'Hughes', 'Flores', 'Washington', 'Butler', 'Simmons', 'Foster', 'Gonzales', 'Bryant', 'Alexander', 'Russell', 'Griffin', 'Diaz', 'Hayes', 'Myers', 'Ford', 'Hamilton', 'Graham', 'Sullivan', 'Wallace', 'Woods', 'Cole', 'West', 'Jordan', 'Owens', 'Reynolds', 'Fisher', 'Ellis', 'Harrison', 'Gibson', 'McDonald', 'Cruz', 'Marshall', 'Ortiz', 'Gomez', 'Murray', 'Freeman', 'Wells', 'Webb', 'Simpson', 'Stevens', 'Tucker', 'Porter', 'Hunter', 'Hicks', 'Crawford', 'Henry', 'Boyd', 'Mason', 'Morales', 'Kennedy', 'Warren', 'Dixon', 'Ramos', 'Reyes', 'Burns', 'Gordon', 'Shaw', 'Holmes', 'Rice', 'Robertson', 'Hunt', 'Black', 'Daniels', 'Palmer', 'Mills', 'Nichols', 'Grant', 'Knight', 'Ferguson', 'Rose', 'Stone', 'Hawkins', 'Dunn', 'Perkins', 'Hudson', 'Spencer', 'Gardner', 'Stephens', 'Payne', 'Pierce', 'Berry', 'Matthews', 'Arnold', 'Wagner', 'Willis', 'Ray', 'Watkins', 'Olson', 'Carroll', 'Duncan', 'Snyder', 'Hart', 'Cunningham', 'Bradley', 'Lane', 'Andrews', 'Ruiz', 'Harper', 'Fox', 'Riley', 'Armstrong', 'Carpenter', 'Weaver', 'Greene', 'Lawrence', 'Elliott', 'Chavez', 'Sims', 'Austin', 'Peters', 'Kelley', 'Franklin', 'Lawson', 'Fields', 'Gutierrez', 'Ryan', 'Schmidt', 'Carr', 'Vasquez', 'Castillo', 'Wheeler', 'Chapman', 'Oliver', 'Montgomery', 'Richards', 'Williamson', 'Johnston', 'Banks', 'Meyer', 'Bishop', 'McCoy', 'Howell', 'Alvarez', 'Morrison', 'Hansen', 'Fernandez', 'Garza', 'Harvey', 'Little', 'Burton', 'Stanley', 'Nguyen', 'George', 'Jacobs', 'Reid', 'Kim', 'Fuller', 'Lynch', 'Dean', 'Gilbert', 'Garrett', 'Romero', 'Welch', 'Larson', 'Frazier', 'Burke', 'Hanson', 'Day', 'Mendoza', 'Moreno', 'Bowman', 'Medina', 'Fowler', 'Brewer', 'Hoffman', 'Carlson', 'Silva', 'Pearson', 'Holland', 'Douglas', 'Fleming', 'Jensen', 'Vargas', 'Byrd', 'Davidson', 'Hopkins', 'May', 'Terry', 'Herrera', 'Wade', 'Soto', 'Walters', 'Curtis', 'Neal', 'Caldwell', 'Lowe', 'Jennings', 'Barnett', 'Graves', 'Jimenez', 'Horton', 'Shelton', 'Barrett', 'Obrien', 'Castro', 'Sutton', 'Gregory', 'McKinney', 'Lucas', 'Miles', 'Craig', 'Rodriquez', 'Chambers', 'Holt', 'Lambert', 'Fletcher', 'Watts', 'Bates', 'Hale', 'Rhodes', 'Pena', 'Beck', 'Newman', 'Haynes', 'McDaniel', 'Mendez', 'Bush', 'Vaughn', 'Parks', 'Dawson', 'Santiago', 'Norris', 'Hardy', 'Love', 'Steele', 'Curry', 'Powers', 'Schultz', 'Barker', 'Guzman', 'Page', 'Munoz', 'Ball', 'Keller', 'Chandler', 'Weber', 'Leonard', 'Walsh', 'Lyons', 'Ramsey', 'Wolfe', 'Schneider', 'Mullins', 'Benson', 'Sharp', 'Bowen', 'Daniel', 'Barber', 'Cummings', 'Hines', 'Baldwin', 'Griffith', 'Valdez', 'Hubbard', 'Salazar', 'Reeves', 'Warner', 'Stevenson', 'Burgess', 'Santos', 'Tate', 'Cross', 'Garner', 'Mann', 'Mack', 'Moss', 'Thornton', 'Dennis', 'McGee', 'Farmer', 'Delgado', 'Aguilar', 'Vega', 'Glover', 'Manning', 'Cohen', 'Harmon', 'Rodgers', 'Robbins', 'Newton', 'Todd', 'Blair', 'Higgins', 'Ingram', 'Reese', 'Cannon', 'Strickland', 'Townsend', 'Potter', 'Goodwin', 'Walton', 'Rowe', 'Hampton', 'Ortega', 'Patton', 'Swanson', 'Joseph', 'Francis', 'Goodman', 'Maldonado', 'Yates', 'Becker', 'Erickson', 'Hodges', 'Rios', 'Conner', 'Adkins', 'Webster', 'Norman', 'Malone', 'Hammond', 'Flowers', 'Cobb', 'Moody', 'Quinn', 'Blake', 'Maxwell', 'Pope', 'Floyd', 'Osborne', 'Paul', 'McCarthy', 'Guerrero', 'Lindsey', 'Estrada', 'Sandoval', 'Gibbs', 'Tyler', 'Gross', 'Fitzgerald', 'Stokes', 'Doyle', 'Sherman', 'Saunders', 'Wise', 'Colon', 'Gill', 'Alvarado', 'Greer', 'Padilla', 'Simon', 'Waters', 'Nunez', 'Ballard', 'Schwartz', 'McBride', 'Houston', 'Christensen', 'Klein', 'Pratt', 'Briggs', 'Parsons', 'McLaughlin', 'Zimmerman', 'French', 'Buchanan', 'Moran', 'Copeland', 'Roy', 'Pittman', 'Brady', 'McCormick', 'Holloway', 'Brock', 'Poole', 'Frank', 'Logan', 'Owen', 'Bass', 'Marsh', 'Drake', 'Wong', 'Jefferson', 'Park', 'Morton', 'Abbott', 'Sparks', 'Patrick', 'Norton', 'Huff', 'Clayton', 'Massey', 'Lloyd', 'Figueroa', 'Carson', 'Bowers', 'Roberson', 'Barton', 'Tran', 'Lamb', 'Harrington', 'Casey', 'Boone', 'Cortez', 'Clarke', 'Mathis', 'Singleton', 'Wilkins', 'Cain', 'Bryan', 'Underwood', 'Hogan', 'McKenzie', 'Collier', 'Luna', 'Phelps', 'McGuire', 'Allison', 'Bridges', 'Wilkerson', 'Nash', 'Summers', 'Atkins'],
                // Data taken from http://www.dati.gov.it/dataset/comune-di-firenze_0164 (first 1000)
            "it": ["Acciai", "Aglietti", "Agostini", "Agresti", "Ahmed", "Aiazzi", "Albanese", "Alberti", "Alessi", "Alfani", "Alinari", "Alterini", "Amato", "Ammannati", "Ancillotti", "Andrei", "Andreini", "Andreoni", "Angeli", "Anichini", "Antonelli", "Antonini", "Arena", "Ariani", "Arnetoli", "Arrighi", "Baccani", "Baccetti", "Bacci", "Bacherini", "Badii", "Baggiani", "Baglioni", "Bagni", "Bagnoli", "Baldassini", "Baldi", "Baldini", "Ballerini", "Balli", "Ballini", "Balloni", "Bambi", "Banchi", "Bandinelli", "Bandini", "Bani", "Barbetti", "Barbieri", "Barchielli", "Bardazzi", "Bardelli", "Bardi", "Barducci", "Bargellini", "Bargiacchi", "Barni", "Baroncelli", "Baroncini", "Barone", "Baroni", "Baronti", "Bartalesi", "Bartoletti", "Bartoli", "Bartolini", "Bartoloni", "Bartolozzi", "Basagni", "Basile", "Bassi", "Batacchi", "Battaglia", "Battaglini", "Bausi", "Becagli", "Becattini", "Becchi", "Becucci", "Bellandi", "Bellesi", "Belli", "Bellini", "Bellucci", "Bencini", "Benedetti", "Benelli", "Beni", "Benini", "Bensi", "Benucci", "Benvenuti", "Berlincioni", "Bernacchioni", "Bernardi", "Bernardini", "Berni", "Bernini", "Bertelli", "Berti", "Bertini", "Bessi", "Betti", "Bettini", "Biagi", "Biagini", "Biagioni", "Biagiotti", "Biancalani", "Bianchi", "Bianchini", "Bianco", "Biffoli", "Bigazzi", "Bigi", "Biliotti", "Billi", "Binazzi", "Bindi", "Bini", "Biondi", "Bizzarri", "Bocci", "Bogani", "Bolognesi", "Bonaiuti", "Bonanni", "Bonciani", "Boncinelli", "Bondi", "Bonechi", "Bongini", "Boni", "Bonini", "Borchi", "Boretti", "Borghi", "Borghini", "Borgioli", "Borri", "Borselli", "Boschi", "Bottai", "Bracci", "Braccini", "Brandi", "Braschi", "Bravi", "Brazzini", "Breschi", "Brilli", "Brizzi", "Brogelli", "Brogi", "Brogioni", "Brunelli", "Brunetti", "Bruni", "Bruno", "Brunori", "Bruschi", "Bucci", "Bucciarelli", "Buccioni", "Bucelli", "Bulli", "Burberi", "Burchi", "Burgassi", "Burroni", "Bussotti", "Buti", "Caciolli", "Caiani", "Calabrese", "Calamai", "Calamandrei", "Caldini", "Calo'", "Calonaci", "Calosi", "Calvelli", "Cambi", "Camiciottoli", "Cammelli", "Cammilli", "Campolmi", "Cantini", "Capanni", "Capecchi", "Caponi", "Cappelletti", "Cappelli", "Cappellini", "Cappugi", "Capretti", "Caputo", "Carbone", "Carboni", "Cardini", "Carlesi", "Carletti", "Carli", "Caroti", "Carotti", "Carrai", "Carraresi", "Carta", "Caruso", "Casalini", "Casati", "Caselli", "Casini", "Castagnoli", "Castellani", "Castelli", "Castellucci", "Catalano", "Catarzi", "Catelani", "Cavaciocchi", "Cavallaro", "Cavallini", "Cavicchi", "Cavini", "Ceccarelli", "Ceccatelli", "Ceccherelli", "Ceccherini", "Cecchi", "Cecchini", "Cecconi", "Cei", "Cellai", "Celli", "Cellini", "Cencetti", "Ceni", "Cenni", "Cerbai", "Cesari", "Ceseri", "Checcacci", "Checchi", "Checcucci", "Cheli", "Chellini", "Chen", "Cheng", "Cherici", "Cherubini", "Chiaramonti", "Chiarantini", "Chiarelli", "Chiari", "Chiarini", "Chiarugi", "Chiavacci", "Chiesi", "Chimenti", "Chini", "Chirici", "Chiti", "Ciabatti", "Ciampi", "Cianchi", "Cianfanelli", "Cianferoni", "Ciani", "Ciapetti", "Ciappi", "Ciardi", "Ciatti", "Cicali", "Ciccone", "Cinelli", "Cini", "Ciobanu", "Ciolli", "Cioni", "Cipriani", "Cirillo", "Cirri", "Ciucchi", "Ciuffi", "Ciulli", "Ciullini", "Clemente", "Cocchi", "Cognome", "Coli", "Collini", "Colombo", "Colzi", "Comparini", "Conforti", "Consigli", "Conte", "Conti", "Contini", "Coppini", "Coppola", "Corsi", "Corsini", "Corti", "Cortini", "Cosi", "Costa", "Costantini", "Costantino", "Cozzi", "Cresci", "Crescioli", "Cresti", "Crini", "Curradi", "D'Agostino", "D'Alessandro", "D'Amico", "D'Angelo", "Daddi", "Dainelli", "Dallai", "Danti", "Davitti", "De Angelis", "De Luca", "De Marco", "De Rosa", "De Santis", "De Simone", "De Vita", "Degl'Innocenti", "Degli Innocenti", "Dei", "Del Lungo", "Del Re", "Di Marco", "Di Stefano", "Dini", "Diop", "Dobre", "Dolfi", "Donati", "Dondoli", "Dong", "Donnini", "Ducci", "Dumitru", "Ermini", "Esposito", "Evangelisti", "Fabbri", "Fabbrini", "Fabbrizzi", "Fabbroni", "Fabbrucci", "Fabiani", "Facchini", "Faggi", "Fagioli", "Failli", "Faini", "Falciani", "Falcini", "Falcone", "Fallani", "Falorni", "Falsini", "Falugiani", "Fancelli", "Fanelli", "Fanetti", "Fanfani", "Fani", "Fantappie'", "Fantechi", "Fanti", "Fantini", "Fantoni", "Farina", "Fattori", "Favilli", "Fedi", "Fei", "Ferrante", "Ferrara", "Ferrari", "Ferraro", "Ferretti", "Ferri", "Ferrini", "Ferroni", "Fiaschi", "Fibbi", "Fiesoli", "Filippi", "Filippini", "Fini", "Fioravanti", "Fiore", "Fiorentini", "Fiorini", "Fissi", "Focardi", "Foggi", "Fontana", "Fontanelli", "Fontani", "Forconi", "Formigli", "Forte", "Forti", "Fortini", "Fossati", "Fossi", "Francalanci", "Franceschi", "Franceschini", "Franchi", "Franchini", "Franci", "Francini", "Francioni", "Franco", "Frassineti", "Frati", "Fratini", "Frilli", "Frizzi", "Frosali", "Frosini", "Frullini", "Fusco", "Fusi", "Gabbrielli", "Gabellini", "Gagliardi", "Galanti", "Galardi", "Galeotti", "Galletti", "Galli", "Gallo", "Gallori", "Gambacciani", "Gargani", "Garofalo", "Garuglieri", "Gashi", "Gasperini", "Gatti", "Gelli", "Gensini", "Gentile", "Gentili", "Geri", "Gerini", "Gheri", "Ghini", "Giachetti", "Giachi", "Giacomelli", "Gianassi", "Giani", "Giannelli", "Giannetti", "Gianni", "Giannini", "Giannoni", "Giannotti", "Giannozzi", "Gigli", "Giordano", "Giorgetti", "Giorgi", "Giovacchini", "Giovannelli", "Giovannetti", "Giovannini", "Giovannoni", "Giuliani", "Giunti", "Giuntini", "Giusti", "Gonnelli", "Goretti", "Gori", "Gradi", "Gramigni", "Grassi", "Grasso", "Graziani", "Grazzini", "Greco", "Grifoni", "Grillo", "Grimaldi", "Grossi", "Gualtieri", "Guarducci", "Guarino", "Guarnieri", "Guasti", "Guerra", "Guerri", "Guerrini", "Guidi", "Guidotti", "He", "Hoxha", "Hu", "Huang", "Iandelli", "Ignesti", "Innocenti", "Jin", "La Rosa", "Lai", "Landi", "Landini", "Lanini", "Lapi", "Lapini", "Lari", "Lascialfari", "Lastrucci", "Latini", "Lazzeri", "Lazzerini", "Lelli", "Lenzi", "Leonardi", "Leoncini", "Leone", "Leoni", "Lepri", "Li", "Liao", "Lin", "Linari", "Lippi", "Lisi", "Livi", "Lombardi", "Lombardini", "Lombardo", "Longo", "Lopez", "Lorenzi", "Lorenzini", "Lorini", "Lotti", "Lu", "Lucchesi", "Lucherini", "Lunghi", "Lupi", "Madiai", "Maestrini", "Maffei", "Maggi", "Maggini", "Magherini", "Magini", "Magnani", "Magnelli", "Magni", "Magnolfi", "Magrini", "Malavolti", "Malevolti", "Manca", "Mancini", "Manetti", "Manfredi", "Mangani", "Mannelli", "Manni", "Mannini", "Mannucci", "Manuelli", "Manzini", "Marcelli", "Marchese", "Marchetti", "Marchi", "Marchiani", "Marchionni", "Marconi", "Marcucci", "Margheri", "Mari", "Mariani", "Marilli", "Marinai", "Marinari", "Marinelli", "Marini", "Marino", "Mariotti", "Marsili", "Martelli", "Martinelli", "Martini", "Martino", "Marzi", "Masi", "Masini", "Masoni", "Massai", "Materassi", "Mattei", "Matteini", "Matteucci", "Matteuzzi", "Mattioli", "Mattolini", "Matucci", "Mauro", "Mazzanti", "Mazzei", "Mazzetti", "Mazzi", "Mazzini", "Mazzocchi", "Mazzoli", "Mazzoni", "Mazzuoli", "Meacci", "Mecocci", "Meini", "Melani", "Mele", "Meli", "Mengoni", "Menichetti", "Meoni", "Merlini", "Messeri", "Messina", "Meucci", "Miccinesi", "Miceli", "Micheli", "Michelini", "Michelozzi", "Migliori", "Migliorini", "Milani", "Miniati", "Misuri", "Monaco", "Montagnani", "Montagni", "Montanari", "Montelatici", "Monti", "Montigiani", "Montini", "Morandi", "Morandini", "Morelli", "Moretti", "Morganti", "Mori", "Morini", "Moroni", "Morozzi", "Mugnai", "Mugnaini", "Mustafa", "Naldi", "Naldini", "Nannelli", "Nanni", "Nannini", "Nannucci", "Nardi", "Nardini", "Nardoni", "Natali", "Ndiaye", "Nencetti", "Nencini", "Nencioni", "Neri", "Nesi", "Nesti", "Niccolai", "Niccoli", "Niccolini", "Nigi", "Nistri", "Nocentini", "Noferini", "Novelli", "Nucci", "Nuti", "Nutini", "Oliva", "Olivieri", "Olmi", "Orlandi", "Orlandini", "Orlando", "Orsini", "Ortolani", "Ottanelli", "Pacciani", "Pace", "Paci", "Pacini", "Pagani", "Pagano", "Paggetti", "Pagliai", "Pagni", "Pagnini", "Paladini", "Palagi", "Palchetti", "Palloni", "Palmieri", "Palumbo", "Pampaloni", "Pancani", "Pandolfi", "Pandolfini", "Panerai", "Panichi", "Paoletti", "Paoli", "Paolini", "Papi", "Papini", "Papucci", "Parenti", "Parigi", "Parisi", "Parri", "Parrini", "Pasquini", "Passeri", "Pecchioli", "Pecorini", "Pellegrini", "Pepi", "Perini", "Perrone", "Peruzzi", "Pesci", "Pestelli", "Petri", "Petrini", "Petrucci", "Pettini", "Pezzati", "Pezzatini", "Piani", "Piazza", "Piazzesi", "Piazzini", "Piccardi", "Picchi", "Piccini", "Piccioli", "Pieraccini", "Pieraccioni", "Pieralli", "Pierattini", "Pieri", "Pierini", "Pieroni", "Pietrini", "Pini", "Pinna", "Pinto", "Pinzani", "Pinzauti", "Piras", "Pisani", "Pistolesi", "Poggesi", "Poggi", "Poggiali", "Poggiolini", "Poli", "Pollastri", "Porciani", "Pozzi", "Pratellesi", "Pratesi", "Prosperi", "Pruneti", "Pucci", "Puccini", "Puccioni", "Pugi", "Pugliese", "Puliti", "Querci", "Quercioli", "Raddi", "Radu", "Raffaelli", "Ragazzini", "Ranfagni", "Ranieri", "Rastrelli", "Raugei", "Raveggi", "Renai", "Renzi", "Rettori", "Ricci", "Ricciardi", "Ridi", "Ridolfi", "Rigacci", "Righi", "Righini", "Rinaldi", "Risaliti", "Ristori", "Rizzo", "Rocchi", "Rocchini", "Rogai", "Romagnoli", "Romanelli", "Romani", "Romano", "Romei", "Romeo", "Romiti", "Romoli", "Romolini", "Rontini", "Rosati", "Roselli", "Rosi", "Rossetti", "Rossi", "Rossini", "Rovai", "Ruggeri", "Ruggiero", "Russo", "Sabatini", "Saccardi", "Sacchetti", "Sacchi", "Sacco", "Salerno", "Salimbeni", "Salucci", "Salvadori", "Salvestrini", "Salvi", "Salvini", "Sanesi", "Sani", "Sanna", "Santi", "Santini", "Santoni", "Santoro", "Santucci", "Sardi", "Sarri", "Sarti", "Sassi", "Sbolci", "Scali", "Scarpelli", "Scarselli", "Scopetani", "Secci", "Selvi", "Senatori", "Senesi", "Serafini", "Sereni", "Serra", "Sestini", "Sguanci", "Sieni", "Signorini", "Silvestri", "Simoncini", "Simonetti", "Simoni", "Singh", "Sodi", "Soldi", "Somigli", "Sorbi", "Sorelli", "Sorrentino", "Sottili", "Spina", "Spinelli", "Staccioli", "Staderini", "Stefanelli", "Stefani", "Stefanini", "Stella", "Susini", "Tacchi", "Tacconi", "Taddei", "Tagliaferri", "Tamburini", "Tanganelli", "Tani", "Tanini", "Tapinassi", "Tarchi", "Tarchiani", "Targioni", "Tassi", "Tassini", "Tempesti", "Terzani", "Tesi", "Testa", "Testi", "Tilli", "Tinti", "Tirinnanzi", "Toccafondi", "Tofanari", "Tofani", "Tognaccini", "Tonelli", "Tonini", "Torelli", "Torrini", "Tosi", "Toti", "Tozzi", "Trambusti", "Trapani", "Tucci", "Turchi", "Ugolini", "Ulivi", "Valente", "Valenti", "Valentini", "Vangelisti", "Vanni", "Vannini", "Vannoni", "Vannozzi", "Vannucchi", "Vannucci", "Ventura", "Venturi", "Venturini", "Vestri", "Vettori", "Vichi", "Viciani", "Vieri", "Vigiani", "Vignoli", "Vignolini", "Vignozzi", "Villani", "Vinci", "Visani", "Vitale", "Vitali", "Viti", "Viviani", "Vivoli", "Volpe", "Volpi", "Wang", "Wu", "Xu", "Yang", "Ye", "Zagli", "Zani", "Zanieri", "Zanobini", "Zecchi", "Zetti", "Zhang", "Zheng", "Zhou", "Zhu", "Zingoni", "Zini", "Zoppi"],
            "ru": ["Абабков", "Абаимов", "Абакишин", "Абакулин", "Абакулов", "Абакумкин", "Абакумов", "Абакушин", "Абакшин", "Абалакин", "Абалаков", "Абалдуев", "Абалкин", "Абатурин", "Абатуров", "Абашев", "Абашеев", "Абашенко", "Абашин", "Абашичев", "Абашкин", "Абашков", "Абашуров", "Абаянцев", "Аббакумов", "Абдула", "Абдулин", "Абдулов", "Аблакатов", "Аблеухов", "Абоимов", "Аборин", "Абраменко", "Абраменков", "Абрамкин", "Абрамов", "Абрамович", "Абрамсон", "Абрамуш", "Абрамцев", "Абрамчик", "Абрамчук", "Абрамычев", "Абрахин", "Абрашин", "Абрашкин", "Абрикосов", "Абросимов", "Абросинов", "Аброськин", "Аброшин", "Абухов", "Абухович", "Авакин", "Авакумов", "Аванесов", "Аввакумов", "Августинович", "Августович", "Авдаев", "Авдаков", "Авдевичев", "Авдеев", "Авдеенко", "Авдеенков", "Авдеичев", "Авдейкин", "Авдиев", "Авдин", "Авдонин", "Авдонкин", "Авдонов", "Авдонюшкин", "Авдосев", "Авдотъин", "Авдотьев", "Авдотьин", "Авдохин", "Авдошин", "Авдулов", "Авдусин", "Авдушев", "Авдыев", "Авдышев", "Авдюков", "Авдюнин", "Авдюничев", "Авдюхов", "Авдюшин", "Авениров", "Аверин", "Аверинцев", "Аверихин", "Аверичев", "Аверичкин", "Аверкиев", "Аверкин", "Аверков", "Аверченко", "Аверченков", "Авершин", "Авершьев", "Аверьянов", "Авиафин", "Авилин", "Авилкин", "Авилов", "Авиловичев", "Авксентьев", "Авлампиев", "Авлашкин", "Авлов", "Авлуков", "Авнатамов", "Авнатомов", "Авр", "Авраамов", "Авраменко", "Аврамец", "Аврамов", "Аврамчик", "Аврасин", "Аврашин", "Аврашко", "Аврашков", "Аврашов", "Аврелин", "Аврорин", "Авроров", "Авросимов", "Авросинов", "Авсеев", "Авсеенко", "Авсейкин", "Австрийский", "Авсюков", "Автаев", "Автайкин", "Автоманов", "Автомонов", "Автономов", "Автухов", "Авчинников", "Авчухов", "Агаев", "Агальцов", "Агапеев", "Агапитов", "Агапов", "Агапонов", "Агапьев", "Агарков", "Агафонкин", "Агафонов", "Агашин", "Агашкин", "Агашков", "Аггеев", "Агдавлетов", "Агеев", "Агеенко", "Агеенков", "Агейкин", "Агейчев", "Агейчик", "Агибалов", "Агиевич", "Агин", "Агишев", "Агишин", "Агищев", "Аглинцев", "Агопов", "Агранов", "Аграновский", "Агренев", "Агрененко", "Агриколянский", "Агуреев", "Агушев", "Адаев", "Адаменко", "Адамов", "Адамович", "Адамчук", "Адашев", "Адвокатов", "Адельфинский", "Адинец", "Адонисов", "Адоратский", "Адриянов", "Адуев", "Адыбаев", "Аедоницкий", "Ажгибесов", "Азамов", "Азанов", "Азанчевский", "Азанчеев", "Азарин", "Азаров", "Азарьев", "Азегов", "Азерников", "Азизов", "Азимов", "Азин", "Азначеев", "Азов", "Азовцев", "Азянов", "Аипов", "Айвазов", "Айвазовский", "Айдаров", "Акаткин", "Акатов", "Акатьев", "Акашев", "Акашин", "Акбаров", "Акберов", "Аквилев", "Акдавлетов", "Акентьев", "Акилин", "Акилов", "Акимакин", "Акименко", "Акимихин", "Акимичев", "Акимкин", "Акимов", "Акимочев", "Акимочкин", "Акимушкин", "Акимчев", "Акимчин", "Акимычев", "Акин(ь)шин", "Акиндинов", "Акинин", "Акинишин", "Акинфиев", "Акинфов", "Акинфьев", "Акинчев", "Акиншин", "Акиньшин", "Акифьев", "Акишев", "Акишин", "Аккузин", "Акопов", "Аксаков", "Аксанов", "Аксененко", "Аксененков", "Аксенов", "Аксентьев", "Аксенцев", "Аксенцов", "Аксенюшкин", "Аксинин", "Аксюков", "Аксюта", "Аксютенок", "Аксютин", "Аксянов", "Акуленко", "Акуленок", "Акулин", "Акулинин", "Акулиничев", "Акулинский", "Акулич", "Акулов", "Акулышин", "Акульшин", "Акуляков", "Акундинов", "Акустьев", "Акушев", "Акциперов", "Акципетров", "Акчурин", "Алабердиев", "Алабин", "Алабушев", "Алабышев", "Аладышкин", "Аладьин", "Алаев", "Алайкин", "Алалыкин", "Алампиев", "Алаторцев", "Алатырев", "Алатырцев", "Алачев", "Алачеев", "Алашеев", "Алдаков", "Алдашин", "Алдонин", "Алдохин", "Алдошин", "Алдошкин", "Алдушин", "Алдушкин", "Алдущенков", "Алебастров", "Алеев", "Алейник", "Алейников", "Александренков", "Александрийский", "Александрикин", "Александро", "Александров", "Александровский", "Александрук", "Александрюк", "Алексанин", "Алексанкин", "Алексанов", "Алексахин", "Алексашин", "Алексеев", "Алексеевский", "Алексеенко", "Алексеенков", "Алексеичев", "Алексейчик", "Алексин", "Алексинский", "Алексов", "Алексутин", "Алекторов", "Алемасов", "Алемпиев", "Аленев", "Алеников", "Аленин", "Аленичев", "Аленкин", "Аленников", "Аленов", "Алентов", "Алентьев", "Аленчев", "Аленчиков", "Аленшев", "Алесин", "Алесов", "Алеутский", "Алеханов", "Алехин", "Алехов", "Алешейкин", "Алешечкин", "Алешин", "Алешинцев", "Алешихин", "Алешкевич", "Алешкин", "Алешков", "Алешников", "Алешонков", "Алиев", "Алимгулов", "Алимов", "Алимпиев", "Алин", "Алипанов", "Алипов", "Алипьев", "Алисейко", "Алисов", "Алистратов", "Алифанов", "Алифонов", "Аллавердиев", "Аллавердов", "Аллилуев", "Алмагестов", "Алмагестров", "Алмазов", "Алмин", "Алов", "Алпаров", "Алпатов", "Алпин", "Алтунин", "Алтуфьев", "Алтухов", "Алтынин", "Алтынов", "Алфеев", "Алферов", "Алферьев", "Алфимов", "Алхимов", "Алымбеков", "Алымов", "Алынбеков", "Альбертов", "Альбицкий", "Альбов", "Альбовский", "Альтов", "Альтовский", "Альхименко", "Альхимович", "Альшанников", "Альшевский", "Алютин", "Алюхин", "Алюшин", "Алюшников", "Алябин", "Алябушев", "Алябышев", "Алябьев", "Алявдин", "Аляев", "Алякринский", "Аляпин", "Амбалов", "Амброс", "Амбросий", "Амбросимов", "Амвросимов", "Амвросов", "Амвросьев", "Амеленко", "Амелехин", "Амелин", "Амеличев", "Амелишко", "Амелькин", "Амельчев", "Амельченко", "Амельченков", "Амельянов", "Амелюшкин", "Амелякин", "Американцев", "Аметистов", "Аминов", "Амирев", "Амиров", "Аморский", "Амосов", "Ампелогов", "Ампилов", "Амплеев", "Амстиславский", "Амусин", "Амусов", "Амфилохов", "Амфитеатров", "Амчанинов", "Амченцев", "Амчиславский", "Анаксагоров", "Ананенков", "Ананич", "Ананичев", "Ананкин", "Ананко", "Ананский", "Ананченко", "Ананченков", "Ананьев", "Ананьевский", "Ананьин", "Анастасов", "Анастасьев", "Анаткин", "Анахин", "Анахов", "Анашкин", "Ангарщиков", "Ангелин", "Ангелов", "Ангельский", "Анджиевский", "Андреев", "Андреевский", "Андреенко", "Андреещев", "Андреищев", "Андрейкин", "Андрейцев", "Андрейченко", "Андрейчик", "Андрейчиков", "Андрейчук", "Андренко", "Андреянов", "Андрианов", "Андриановский", "Андриашин", "Андриевский", "Андриенко", "Андрийчак", "Андрийчук", "Андрионов", "Андриянов", "Андрияш", "Андрияшев", "Андрияшкин", "Андроников", "Андронников", "Андронов", "Андропов", "Андросенко", "Андросик", "Андросов", "Андрощенко", "Андрощук", "Андрунец", "Андрунин", "Андрусенко", "Андрусив", "Андрусик", "Андрусишин", "Андрускив", "Андрусов", "Андрусский", "Андрусяк", "Андрухненко", "Андрухович", "Андруша", "Андрушакевич", "Андрушевич", "Андрущакевич", "Андрущенко", "Андрюк", "Андрюков", "Андрюнин", "Андрюхин", "Андрюцкий", "Андрюшечкин", "Андрюшин", "Андрющенко", "Анемхуров", "Аниканов", "Аникеев", "Аникеенко", "Аникикевич", "Аникин", "Аникичев", "Аникушин", "Аникушкин", "Анин", "Анисим", "Анисимков", "Анисимов", "Анисимцев", "Анисин", "Анисифоров", "Анискевич", "Анискин", "Анисковец", "Анискович", "Анисов", "Анисович", "Анистратов", "Аниськин", "Аниськов", "Анихнов", "Аничев", "Аниченко", "Аничкин", "Аничков", "Анищенко", "Анищенков", "Анкидинов", "Анкин", "Анкиндинов", "Анкудимов", "Анкудинов", "Анненков", "Анненский", "Аннин", "Аннинский", "Аннич", "Анничкин", "Аннушкин", "Аннщенкский", "Аннщенский", "Анокин", "Аносков", "Аносов", "Анохин", "Аношечкин", "Аношин", "Аношкин", "Анпилов", "Ансеров", "Антипенко", "Антипенков", "Антипин", "Антипичев", "Антипкин", "Антипов", "Антипьев", "Антифеев", "Антифьев", "Антокольский", "Антоманов", "Антоневич", "Антоненко", "Антоненков", "Антонец", "Антоник", "Антоников", "Антонич", "Антонишин", "Антонников", "Антонов", "Антонович", "Антоновский", "Антонцев", "Антончик", "Антонычев", "Антоньев", "Антонюк", "Антоняк", "Антохи", "Антохин", "Антошин", "Антошкин", "Антошко", "Антощук", "Антропенко", "Антропов", "Антрохин", "Антрошин", "Антрощенко", "Антрушев", "Антрушин", "Антук", "Антуфьев", "Антушев", "Антушевич", "Антыпко", "Антышев", "Антюфеев", "Антюхин", "Антюхов", "Анурин", "Ануров", "Анурьев", "Ануфриев", "Анучин", "Анучкин", "Анушкин", "Анфилатов", "Анфилов", "Анфилодьев", "Анфилофьев", "Анфимкин", "Анфимов", "Анфиногенов", "Анфиногентов", "Анфудимов", "Анфудинов", "Анхим", "Анхимов", "Анцев", "Анцибор", "Анциборенко", "Анциборов", "Анциперов", "Анциферов", "Анцифиров", "Анцишкин", "Анцуп", "Анцупов", "Анцыферов", "Анцыфиров", "Анцышкин", "Анютин", "Апанасенко", "Апашев", "Аплетин", "Аплечеев", "Аполитов", "Аполлонов", "Аполлонский", "Аппаков", "Апраксин", "Апрелиев", "Апрелов", "Апсеитов", "Апухтин", "Аракин", "Аракчеев", "Аралин", "Арамилев", "Арапкин", "Арапов", "Арасланов", "Арбузов", "Аргамаков", "Аргентовский", "Аргунов", "Аргушкин", "Ардабьев", "Ардаев", "Ардалионов", "Ардасенов", "Ардатов", "Ардашев", "Ардашников", "Ардеев", "Аредаков", "Аренов", "Аренский", "Арепьев", "Арестов", "Аретинский", "Арефин", "Арефов", "Арефьев", "Аржавитин", "Аржавитинов", "Аржаев", "Аржаников", "Аржанников", "Аржанов", "Аржанухин", "Аржаных", "Арзамасцев", "Арзубов", "Аринин", "Аринич", "Аринкин", "Аринушкин", "Аринчев", "Аристархов", "Аристов", "Аристовский", "Аристотелев", "Аричков", "Аришин", "Аришкин", "Арищев", "Аркадов", "Аркадьев", "Аркадьин", "Арканников", "Аркашин", "Арнаутов", "Арнольдов", "Аронов", "Арсеев", "Арсеенков", "Арсенин", "Арсеничев", "Арсенков", "Арсенов", "Арсенович", "Арсентьев", "Арсеньев", "Арсенюк", "Арскии", "Арсланов", "Артаков", "Артамонов", "Артамонычев", "Артамохин", "Артамошин", "Артанов", "Артеев", "Артеменко", "Артеменков", "Артемин", "Артемичев", "Артемкин", "Артемов", "Артемчук", "Артемьев", "Артищев", "Артищенко", "Артоболевский", "Артыбашев", "Артыков", "Артюгов", "Артюков", "Артюх", "Артюхин", "Артюхов", "Артюшенко", "Артюшин", "Артюшкевич", "Артюшков", "Артяев", "Арутюнов", "Арутюнян", "Архангельский", "Архаров", "Архип", "Архипенко", "Архипенков", "Архипкин", "Архипов", "Архиповский", "Архипцев", "Архипычев", "Архипьев", "Архиреев", "Арцыбашев", "Арцыбушев", "Аршавский", "Аршанинов", "Аршинников", "Аршинов", "Арысланов", "Асадов", "Асадулин", "Асадуллин", "Асанов", "Асатов", "Асауленко", "Асаулов", "Асаульченко", "Асафов", "Асафьев", "Асеев", "Асейкин", "Асенин", "Асин", "Асинкритов", "Асипенко", "Аскоченский", "Асланов", "Асманов", "Асонов", "Асосков", "Ассанов", "Ассанович", "Ассонов", "Аставин", "Астанин", "Астанкин", "Астанков", "Астанов", "Астапаев", "Астапенко", "Астапенков", "Астапеня", "Астапкин", "Астапов", "Астапович", "Астапченок", "Астапчук", "Астафимов", "Астафичев", "Астафуров", "Астафьев", "Астахин", "Астахов", "Асташев", "Асташевский", "Асташенко", "Асташенков", "Асташин", "Асташкин", "Асташков", "Асташов", "Астров", "Атаманенко", "Атаманов", "Атаманченко", "Атаманчук", "Атаманюк", "Атиков", "Атласов", "Атраментов", "Атрохин", "Атрохов", "Атрошкин", "Атрошков", "Атрощенко", "Атучин", "Аулов", "Аушев", "Афанасенко", "Афанасенков", "Афанаскин", "Афанасов", "Афанасьев", "Афанаськин", "Афинин", "Афинов", "Афиногенов", "Афиногентов", "Афинский", "Афонасьев", "Афонин", "Афоничев", "Афонов", "Афончиков", "Афончин", "Афонышев", "Афонькин", "Афонюшин", "Афонюшкин", "Африканов", "Африкантов", "Афродитин", "Афродитов", "Афросимов", "Афросинов", "Афрунин", "Ахвердов", "Ахмадулин", "Ахматов", "Ахматулин", "Ахмедов", "Ахмедулов", "Ахметов", "Ахметшин", "Ахметьянова", "Ахов", "Ахрамеев", "Ахраменко", "Ахременко", "Ахромеев", "Ахромов", "Ахросимов", "Ахряпов", "Ахтырцев", "Ахунов", "Ачкасов", "Ачугин", "Ашарин", "Ашитков", "Ашкенази", "Ашмарин", "Ашпин", "Ашукин", "Ашурков", "Ашуров", "Ащеулов", "", "Бабянышев", "Бабаджанов", "Бабаев", "Бабаевский", "Бабай", "Бабайкин", "Бабакин", "Бабаков", "Бабанин", "Бабанов", "Бабарыкин", "Бабарыко", "Бабахин", "Бабаченко", "Бабенин", "Бабенко", "Бабенышев", "Бабий", "Бабиков", "Бабин", "Бабинов", "Бабицын", "Бабич", "Бабичев", "Бабкин", "Баборыко", "Бабский", "Бабулин", "Бабунин", "Бабурин", "Бабусин", "Бабухин", "Бабушкин", "Бабыкин", "Бавин", "Бавыкин", "Багаев", "Багин", "Багинин", "Баглаев", "Багреев", "Багримов", "Багров", "Багрянов", "Багрянцев", "Бадаев", "Баданин", "Баданов", "Бадашев", "Бадашкин", "Бадашов", "Бадеин", "Бадигин", "Бадыгин", "Бадьин", "Бадьянов", "Баев", "Бажанов", "Баженов", "Бажин", "Бажов", "Бажуков", "Бажутин", "Бажуткин", "Базанин", "Базанов", "Базарнов", "Базаров", "Базилевский", "Базин", "Базлов", "Базулин", "Базунов", "Базыкин", "Базылев", "Базылевич", "Базылин", "Базырин", "Байбаков", "Байбородин", "Байбородов", "Байгаритин", "Байгулов", "Байгушев", "Байгушкин", "Байдаков", "Байдиков", "Байдин", "Байкачкаров", "Байкин", "Байко", "Байков", "Байковский", "Байкулов", "Баймаков", "Баймурзаев", "Байрамов", "Байтеряков", "Байчиков", "Байчурин", "Бакаев", "Бакакин", "Бакалов", "Бакеев", "Бакешев", "Бакиев", "Бакин", "Бакишев", "Бакланов", "Баклановский", "Бакластый", "Баклин", "Баклушин", "Баклушкин", "Бакулев", "Бакулин", "Бакунин", "Бакурин", "Бакуринский", "Бакшеев", "Бакшин", "Балабайкин", "Балабанов", "Балабашин", "Балабашкин", "Балабиков", "Балабин", "Балабон", "Балабонин", "Балабошин", "Балабошкин", "Балагуров", "Балагушин", "Балакаев", "Балакин", "Балакирев", "Балаклейцев", "Балакшеев", "Балалаев", "Баламатов", "Баламута", "Баламуткин", "Баламутов", "Баландин", "Баланов", "Балахонкин", "Балахонов", "Балашин", "Балашков", "Балашов", "Балдин", "Балеев", "Балиев", "Балин", "Балинкин", "Балинов", "Балихин", "Балмашов", "Балмошнов", "Балобанов", "Балуев", "Балыбердин", "Балыбин", "Балыгин", "Балыкин", "Бальбуциновский", "Балябин", "Балякин", "Балясин", "Балясников", "Балясов", "Бамберг", "Бандурин", "Банин", "Банников", "Баннов", "Банный", "Банных", "Банушкин", "Банщиков", "Барабан", "Барабанов", "Барабанцев", "Барабанщиков", "Барабашин", "Барабашов", "Барабошкин", "Бараков", "Баран", "Бараненков", "Бараненский", "Баранкин", "Барано", "Баранов", "Баранович", "Барановский", "Баранский", "Баранулькин", "Баранулько", "Баранцев", "Баранцов", "Баранчан", "Баранчик", "Баранчиков", "Баранчук", "Барань", "Баратаев", "Баратев", "Баратов", "Баратынскии", "Баратынский", "Барахвостов", "Барашев", "Барашин", "Барашков", "Барбараш", "Барбаш", "Барбашин", "Барбашов", "Барбаянов", "Барбошин", "Барбух", "Барбухин", "Баргузин", "Барда", "Бардадынов", "Бардин", "Баринов", "Баркалов", "Барканов", "Баркашев", "Баркашов", "Барков", "Бармин", "Барон", "Баронин", "Баронов", "Барский", "Барсков", "Барсов", "Барсук", "Барсуков", "Бартелеманов", "Бартелемонов", "Бартенев", "Бартукин", "Баруздин", "Барулин", "Бархатов", "Бархоткин", "Бархотов", "Барыгин", "Барыкин", "Барыков", "Барышев", "Барышников", "Барятинский", "Басалаев", "Басалыгин", "Басангин", "Басанов", "Басаргин", "Басенин", "Басенко", "Басенков", "Басилов", "Басин", "Басистов", "Басистый", "Басихин", "Баскакин", "Баскаков", "Баскин", "Басков", "Баской", "Басманов", "Басов", "Бастанов", "Бастрюков", "Басулин", "Басунов", "Басюк", "Батазов", "Баталов", "Батанов", "Баташев", "Баташов", "Батенев", "Батенин", "Батеньков", "Батечко", "Батин", "Батищев", "Батманов", "Батов", "Батогов", "Батоев", "Батрак", "Батраков", "Батраченко", "Батрашкин", "Батурин", "Батуров", "Батырев", "Батыров", "Батюшкин", "Батюшков", "Батяев", "Батянин", "Бауков", "Баулин", "Бахарев", "Бахарь", "Бахилин", "Бахилов", "Бахирев", "Бахматов", "Бахметев", "Бахметьев", "Бахмутов", "Бахнов", "Бахолдин", "Бахорин", "Бахрамеев", "Бахрушин", "Бахтеяров", "Бахтин", "Бахтинов", "Бахтияров", "Бахусов", "Бахылов", "Бачагов", "Бачманов", "Бачурин", "Бачуринский", "Бачуров", "Башев", "Башилов", "Баширов", "Башкин", "Башкиркин", "Башкиров", "Башкирский", "Башкирцев", "Башкирцов", "Башмаков", "Башурин", "Башуров", "Башутин", "Башуткин", "Баюшев", "Баянов", "Бебенин", "Бегичев", "Беглецов", "Беглов", "Бегунов", "Беда", "Бедарев", "Бедин", "Бедов", "Безбабич", "Безбатько", "Безбожный", "Безбородко", "Безбородов", "Безбородый", "Безвенюк", "Безверхий", "Безверхов", "Безвеселый", "Безгачев", "Безгачий", "Безгодов", "Безгубов", "Безгузиков", "Безгусков", "Бездежский", "Безделкин", "Безденежный", "Безденежных", "Бездетко", "Бездетный", "Бездонов", "Бездудный", "Бездушный", "Безженов", "Безземельный", "Беззубенко", "Беззубенков", "Беззубиков", "Беззубов", "Беззубцев", "Безладнов", "Безладный", "Безлапатов", "Безлейкин", "Безлепицын", "Безлепкин", "Безмалый", "Безматерных", "Безмельницын", "Безмогарычный", "Безногий", "Безногов", "Безносиков", "Безносов", "Безносюк", "Безобразов", "Безплемяннов", "Безпортошный", "Безпрозванный", "Безпута", "Безроднов", "Безродный", "Безрук", "Безрукавый", "Безрукий", "Безруких", "Безруков", "Безрученко", "Безручкин", "Безручко", "Безсало", "Безсонов", "Безстужев", "Безтгялов", "Безуглов", "Безумов", "Безус", "Безусый", "Безухов", "Безхлебицын", "Безчастный", "Безъязычный", "Безызвестных", "Безыменский", "Бейлин", "Бейлинсон", "Бейлис", "Бейлиц", "Бекетов", "Беклемишев", "Беклемышев", "Беклешев", "Беклов", "Бекмансуров", "Бекорюков", "Бектабегов", "Бектемиров", "Бектимиров", "Бектуганов", "Бекулов", "Белан", "Белашов", "Белевитин", "Белевитинов", "Белевитнев", "Белевич", "Белевцев", "Белей", "Беленко", "Беленков", "Беленький", "Белеутов", "Белехов", "Белецкий", "Белик", "Беликов", "Белинский", "Белицкий", "Белкин", "Белобоков", "Белобородкин", "Белобородов", "Белобров", "Белобровко", "Белобровый", "Белобродский", "Белов", "Белованов", "Беловзоров", "Беловодов", "Беловол", "Белоглазов", "Белоголов", "Белогорлов", "Белогорцев", "Белогруд", "Белогрудов", "Белогуб", "Белогубов", "Белогузов", "Белодед", "Белодзед", "Белодуб", "Белозеров", "Белозерский", "Белозерцев", "Белозуб", "Белозубов", "Белоиванов", "Белоклоков", "Белокобыла", "Белокобыльский", "Белоконев", "Белоконский", "Белоконь", "Белокопытов", "Белокринкин", "Белокрылин", "Белокрылов", "Белокрыс", "Белокудрин", "Белокуров", "Белолаптиков", "Белоликов", "Белолипецкий", "Белолобский", "Беломестных", "Белоногин", "Белоногов", "Белоножко", "Белоносов", "Белооченко", "Белопашенцев", "Белопольский", "Белопупов", "Белопухов", "Белоруков", "Белорусов", "Белорусцев", "Белослудцев", "Белослюд", "Белослюдов", "Белосохов", "Белотелов", "Белоус", "Белоусов", "Белоухов", "Белохвостиков", "Белохвостов", "Белоцерковец", "Белоцерковский", "Белошапка", "Белошапкин", "Белошапко", "Белошеев", "Белощек", "Белоярцев", "Белусяк", "Белый", "Белых", "Белышев", "Бельский", "Бельченко", "Белюшин", "Белявский", "Беляев", "Беляков", "Белянин", "Белянкин", "Белянчиков", "Беляцкий", "Беневоленский", "Бенедиктов", "Берденников", "Берденниов", "Бердибеков", "Бердиев", "Бердник", "Бердников", "Бердычев", "Бердышев", "Бердышов", "Бердяев", "Береговой", "Бережинский", "Бережков", "Бережковский", "Бережнов", "Бережнова", "Бережной", "Березанский", "Березин", "Березка", "Березкин", "Березников", "Березов", "Березовский", "Бересневич", "Берестевич", "Берестнев", "Берестов", "Берестюк", "Беркутов", "Берленников", "Берников", "Берсенев", "Бершадский", "Бершицкий", "Бершов", "Бескараваев", "Бескишкин", "Бесков", "Бескоровайный", "Бескровный", "Бесов", "Беспаленко", "Беспалов", "Беспалько", "Беспальчий", "Беспамятнов", "Беспамятных", "Бесперстов", "Беспоясный", "Беспрозванный", "Беспрозванных", "Беспрозванов", "Беспятов", "Бессалов", "Бессергенев", "Бессержнов", "Бессмертнов", "Бессмертный", "Бессмертных", "Бессолицын", "Бессольцев", "Бессонов", "Бесстрашников", "Бестужев", "Бесфамильный", "Бесхлебнов", "Бесхлебный", "Бесчастнов", "Бесчастный", "Бесчастных", "Бесчетвертнов", "Бесшапошников", "Бехтеев", "Бехтерев", "Бецкой", "Бешенцев", "Бещев", "Бибикин", "Бибиков", "Бизунов", "Бизюкин", "Бизюков", "Бизяев", "Бизякин", "Биктемиров", "Биктимиркин", "Биктимиров", "Бикутганов", "Билан", "Билодид", "Бильбасов", "Билятов", "Бимирзин", "Бирев", "Бирилев", "Биричевский", "Биркин", "Бирюков", "Бирючков", "Битков", "Битюгин", "Битюгов", "Битюков", "Битюцкий", "Битяговский", "Бичурин", "Благин", "Благинин", "Благиных", "Благовещенский", "Благовидов", "Благой", "Благонадеждин", "Благонравов", "Благорасссудов", "Благосклонов", "Близнец", "Близнюк", "Близнюков", "Близняков", "Блинков", "Блинников", "Блинов", "Блонский", "Блудов", "Блюмин", "Блюмкин", "Бобко", "Бобков", "Бобов", "Бобович", "Бобовник", "Бобовников", "Бобоедов", "Боборыкин", "Бобр", "Бобренев", "Бобрецкий", "Бобрецов", "Бобрик", "Бобрин", "Бобринский", "Бобрищев", "Бобров", "Бобрович", "Бобровник", "Бобровников", "Бобровский", "Бобровщиков", "Бобрышев", "Бобыкин", "Бобылев", "Бобыльков", "Бобынин", "Бобырев", "Бобырь", "Бовин", "Бовкун", "Бовкунов", "Бовыкин", "Богаевский", "Богатиков", "Богатищев", "Богаткин", "Богатков", "Богатов", "Богатушин", "Богатченко", "Богатюк", "Богач", "Богачев", "Богачевич", "Богачков", "Богачук", "Богдан", "Богданин", "Богданов", "Богданович", "Богдановский", "Богдашкин", "Богдашов", "Богодухов", "Богоевленский", "Боголепов", "Богомаз", "Богомазов", "Богомолов", "Богородицкий", "Богородский", "Богороцкий", "Богословский", "Богоявленский", "Богуславец", "Богуславский", "Богуш", "Богушевич", "Бодреев", "Бодренков", "Бодров", "Бодягин", "Боев", "Боженко", "Божков", "Божутин", "Бозило", "Бойко", "Бойков", "Бойцов", "БокарЯв", "Бокарев", "Боков", "Болакин", "Болатов", "Болгарский", "Болгов", "Болдарев", "Болдин", "Болдырев", "Болдыревский", "Болибрух", "Болкунов", "Болобанов", "Болотин", "Болотников", "Болотов", "Болтин", "Болтнев", "Болтов", "Болтунов", "Болховитинов", "Болховских", "Большагин", "Большаков", "Большев", "Большевиков", "Большин", "Больших", "Большов", "Большой", "Большуков", "Большухин", "Больщещапов", "Бондарев", "Бондаренко", "Бондарчук", "Бондарь", "Бондарюк", "Бондин", "Бонифатьев", "Боратынский", "Борахвостов", "Борбошин", "Бордуков", "Бордюков", "Борзенко", "Борзенков", "Борзиков", "Борзов", "Борзунов", "Борзых", "Борин", "Борисевич", "Борисенко", "Борисенков", "Борисенок", "Борисихин", "Борискин", "Борисов", "Борисовец", "Борисович", "Борисоглебский", "Борисычев", "Борисяк", "Боричев", "Борищев", "Борищенко", "Борков", "Борковский", "Борлей", "Боровик", "Боровиков", "Боровиковский", "Боровитин", "Боровитинов", "Боровицкий", "Боровко", "Боровков", "Боровлев", "Боровов", "Боровой", "Боровский", "Боровской", "Боровых", "Бородин", "Бородинов", "Бородихин", "Бородулин", "Бородыня", "Борозденков", "Бороздин", "Бороздюхин", "Боронин", "Боротынский", "Бортенев", "Бортников", "Борулин", "Борыкин", "Борыков", "Борягин", "Боряков", "Босенко", "Босов", "Босолаев", "Босулаев", "Босый", "Босяк", "Боталов", "Ботаногов", "Боташев", "Боташов", "Ботвенко", "Ботвин", "Боткин", "Боцян", "Боцяновский", "Бочагов", "Бочарников", "Бочаров", "Бочкарев", "Бояренцев", "Бояринов", "Бояринцев", "Боярский", "Боярышников", "Брага", "Брагин", "Бражин", "Бражкин", "Бражник", "Бражников", "Бражницын", "Брайнин", "Брайнович", "Браславский", "Браслетов", "Братанов", "Братишкин", "Братищев", "Братков", "Братухин", "Братцев", "Братчиков", "Бредихин", "Брежнев", "Брежной", "Брежный", "Бреславский", "Бреусов", "Брехов", "Брехунец", "Брехунов", "Бржозовский", "Бриллиантов", "Бритвин", "Бритиков", "Бричкин", "Бровиков", "Бровин", "Бровкин", "Бровко", "Бровков", "Бровцев", "Бровцын", "Бровчук", "Бродников", "Бродовский", "Бродский", "Бродягин", "Бронин", "Бронников", "Бронский", "Бронских", "Брудастов", "Брусенцов", "Брусилов", "Брусиловский", "Брусникин", "Брусницын", "Брусничкин", "Брусянин", "Брызгалов", "Брызгунов", "Брыластов", "Брылев", "Брылин", "Брыль", "Брындин", "Брынзов", "Брынцалов", "Брыснев", "Брысов", "Брюллов", "Брюсов", "Брюханов", "Брюхатов", "Брюхачев", "Брюхов", "Брюшков", "Брянцев", "Брянцов", "Брянчанинов", "Брянчининов", "Брянчинцов", "Бубеннов", "Бубенцов", "Бубенчиков", "Бубенщиков", "Бубликов", "Бубнов", "Бубукин", "Бугаев", "Бугаевский", "Бугай", "Бугрименко", "Бугримов", "Бугров", "БудЯнный", "Будаев", "Буданов", "Бударин", "Бударов", "Буденный", "Буденый", "Будилов", "Будиловский", "Будищев", "Будник", "Будников", "Будорагин", "Бужанинов", "Буженинов", "Бузанов", "Буздырин", "Бузин", "Бузовлев", "Бузулуков", "Бузунов", "Буйко", "Буйков", "Буйнов", "Буйносов", "Букаев", "Букало", "Букалов", "Буканов", "Букетов", "Букин", "Букиных", "Буконин", "Букреев", "Букрябов", "Булавин", "Буланин", "Буланов", "Буланый", "Булат", "Булаткин", "Булатников", "Булатный", "Булатов", "Булах", "Булахов", "Булаховский", "Булашев", "Булашевич", "Булгак", "Булгаков", "Булганин", "Булгарин", "Булгаров", "Булгачев", "Булкин", "Булочкин", "Булочник", "Булочников", "Булыгин", "Булыженков", "Булычев", "Бунин", "Бураков", "Буранов", "Бураченко", "Бурда", "Бурдаков", "Бурдасов", "Бурдастов", "Бурдин", "Бурдуков", "Бурдуковский", "Бурдюгов", "Бурдюков", "Буренин", "Буренков", "Бурин", "Буркин", "Бурков", "Бурлаков", "Бурлацкий", "Бурлин", "Бурмакин", "Бурмин", "Бурмистов", "Бурмистров", "Бурнашев", "Бурнашов", "Буробин", "Буров", "Бурулев", "Бурханов", "Бурцев", "Бурцов", "Бурый", "Бурых", "Бурьянов", "Буряков", "Буряткин", "Буряченко", "Буслаев", "Бусурманов", "Бусыгин", "Бут", "Бутаков", "Бутарев", "Бутейко", "Бутенев", "Бутенин", "Бутенко", "Бутин", "Бутко", "Бутков", "Бутлеров", "Бутников", "Бутов", "Бутогин", "Буторин", "Бутримов", "Бутрин", "Бутров", "Бутурлакин", "Бутурлин", "Бутусин", "Бутусов", "Бутчик", "Бутюгин", "Буханов", "Буханцов", "Бухарин", "Бухаринов", "Бухаров", "Бухвостов", "Бухов", "Бухонин", "Бухтормин", "Бучалин", "Бучин", "Бучинский", "Бучнев", "Буш", "Бушенев", "Бушин", "Бушкин", "Бушков", "Бушковский", "Бушманов", "Бушмин", "Бушуев", "Буяневич", "Буянов", "Буянтуев", "Бывшев", "Бывших", "Быкадоров", "Быков", "Быковский", "Быковских", "Быстреев", "Быстров", "Быстровзоров", "Быстроглазов", "Быстроногов", "Быстрых", "Быховский", "Бычатин", "Бычатников", "Быченко", "Быченок", "Бычков", "Бычковский", "Бычников", "Бялик", "Бялко", "Бялковский", "Бялый", "", "Вавилин", "Вавилов", "Вага", "Ваганков", "Ваганов", "Ваганьков", "Вагин", "Вагрин", "Вадбальский", "Вадбольский", "Вадимов", "Вадьяев", "Важенин", "Важин", "Важинский", "Вайванцев", "Вайгачев", "Вайтович", "Вакорев", "Вакорин", "Вакула", "Вакуленко", "Вакулин", "Вакулич", "Вакулов", "Вакульчук", "Вакулюк", "Валахов", "Валдавин", "Валдаев", "Валеев", "Валенков", "Валентинов", "Валенцов", "Валерианов", "Валерьев", "Валерьянов", "Валиев", "Валиков", "Валин", "Валковский", "Валов", "Валуев", "Валухов", "Вальков", "Вальцев", "Вальцов", "Вальчук", "Валюкевич", "Вандышев", "Ванеев", "Ванехин", "Ванечкин", "Ванин", "Ванифатьев", "Ваничев", "Ваничкин", "Ваничков", "Ванкеев", "Ванков", "Ванников", "Ванслов", "Ванцов", "Ванчаков", "Ванчиков", "Ваншенкин", "Ванькин", "Ваньков", "Ваньтяев", "Ваньшев", "Ваньшин", "Ванюков", "Ванютин", "Ванюхин", "Ванюшечкин", "Ванюшин", "Ванюшкин", "Ванявин", "Ванявкин", "Ванягин", "Ванякин", "Ваняркин", "Ванятин", "Ваняшин", "Ваняшкин", "Варакин", "Варакосов", "Вараксин", "Варапанов", "Варахобин", "Варахобов", "Варварин", "Варваринский", "Варваркин", "Варваров", "Варвашеня", "Варвулев", "Варганов", "Варгасов", "Варгин", "Вардин", "Вареников", "Вареничев", "Варенников", "Варенцов", "Варзин", "Варзугин", "Варибрус", "Варивода", "Варик", "Варищев", "Варлаков", "Варламов", "Варлахин", "Варлашин", "Варлашкин", "Варлов", "Варлыгин", "Варнавин", "Варнаков", "Варначев", "Варухин", "Варфаламеев", "Варфаломеев", "Варфоламеев", "Варфоломеев", "Варфоломейчук", "Варченко", "Варшавер", "Варшавский", "Варшавчик", "Варшавщик", "Варюха", "Варюхин", "Варюшин", "Васейкин", "Васенев", "Васенин", "Васенкин", "Васенков", "Васенцов", "Васенькин", "Васечкин", "Васечко", "Васик", "Василев", "Василевич", "Василевский", "Василенко", "Василенков", "Василенок", "Василеха", "Василец", "Василечко", "Василинчук", "Василисин", "Василисов", "Василичев", "Василишин", "Василищев", "Василов", "Васильев", "Васильевых", "Васильков", "Васильковский", "Васильцев", "Васильцов", "Васильченко", "Васильченов", "Васильчиков", "Васильчук", "Василюк", "Васин", "Васинский", "Васинцев", "Васичев", "Васищев", "Васкин", "Васков", "Васляев", "Васнев", "Васненко", "Васнецов", "Васынев", "Васькин", "Васько", "Васьков", "Васькович", "Васьянов", "Васюкин", "Васюков", "Васюнин", "Васюничев", "Васюнкин", "Васюта", "Васютин", "Васютинский", "Васютичев", "Васюткин", "Васюточкин", "Васютчев", "Васюхин", "Васюхичев", "Васюхнов", "Васюченко", "Васючков", "Васюшин", "Васюшкин", "Васягин", "Васяев", "Васякин", "Васянин", "Васянович", "Васяшин", "Ватагин", "Ватин", "Ватолин", "Ваторопин", "Ватутин", "Ваулин", "Ваулиных", "Вахламкин", "Вахлов", "Вахменин", "Вахмистров", "Вахнев", "Вахнин", "Вахно", "Вахов", "Вахонин", "Вахрамеев", "Вахромеев", "Вахромцев", "Вахрушев", "Вахрушин", "Вахрушкин", "Вахрушков", "Вашенцев", "Вашин", "Вашурин", "Вашуркин", "Вашутин", "Ващенко", "Введенский", "Вдовенко", "Вдовин", "Вдовичев", "Вдовкин", "Вдовских", "Вдовцов", "Веденеев", "Ведениктов", "Веденин", "Веденисов", "Веденичев", "Веденкин", "Ведентьев", "Веденькин", "Веденялин", "Веденяпин", "Ведерников", "Ведехин", "Ведехов", "Ведешкин", "Ведин", "Ведихов", "Ведищев", "Ведмедь", "Ведяев", "Ведяшкин", "Вежин", "Вежливцев", "Векшегонов", "Векшин", "Векшинский", "Велесевич", "Велехов", "Великанов", "Великголова", "Великий", "Великобородов", "Великов", "Великович", "Великород", "Великосельский", "Велисевич", "Велихов", "Величко", "Велосипедов", "Велтистов", "Велтищев", "Вельмукин", "Вельский", "Вельтистов", "Вельтищев", "Вельяминов", "Вельяшев", "Велюгин", "Велюшин", "Веляшев", "Венгеров", "Венгерский", "Венгров", "Веневитинов", "Веневцев", "Венедиктов", "Венерин", "Венецианов", "Венчаков", "Веньгин", "Веньчаков", "Веньяминов", "Вепрев", "Веприков", "Вепринцев", "Вепрюшкин", "Верба", "Вербин", "Вербицкий", "Верболозов", "Вергазов", "Вергасов", "Вергизов", "Вердеревский", "Веревкин", "Вережников", "Вереитинов", "Вереичев", "Верекундов", "Веремеев", "Веремейчик", "Верес", "Вересаев", "Вересов", "Вересоцкий", "Веретельников", "Веретенников", "Веретин", "Верецкий", "Верещагин", "Верещака", "Верещако", "Вержбицкий", "Верзеин", "Верзилин", "Верзилов", "Веригин", "Верижников", "Верин", "Верлооченко", "Вернадский", "Верначев", "Вернигора", "Вернигоров", "Верочкин", "Верстовский", "Вертипорох", "Вертоградов", "Вертоградский", "Вертыпорох", "Верховинин", "Верховитинов", "Верховский", "Верховской", "Верховцев", "Верхоланцев", "Верхотуров", "Верхотурцев", "Верхратский", "Верчидуб", "Вершигора", "Вершило", "Вершинин", "Вершков", "Верьянов", "Веселов", "Веселовсий", "Веселовский", "Веселых", "Веслов", "Веснин", "Веснов", "Ветер", "Веткин", "Ветлицкий", "Ветлугин", "Ветошкин", "Ветошников", "Ветринский", "Ветров", "Ветчинин", "Ветчинкин", "Ветютнев", "Вечеслов", "Вечканов", "Вешняков", "Взварыкин", "Взворыкин", "Вианоров", "Вигилянский", "Виденеев", "Видиков", "Видинеев", "Видов", "Видяев", "Видякин", "Видяков", "Видяпин", "Видясов", "Викентьев", "Викторевич", "Викторов", "Викторовский", "Викулин", "Викулов", "Вилегжанин", "Вилежанин", "Виленский", "Вилокосов", "Вильный", "Вилягжанин", "Винаров", "Виниченко", "Винков", "Винников", "Винниченко", "Виноградов", "Виноградский", "Виножадов", "Винокур", "Винокуров", "Винокурский", "Винокурцев", "Винохватов", "Виноходов", "Виноходцев", "Винярский", "Виргилиев", "Вирский", "Вирясов", "Висковатов", "Висковатый", "Вискунов", "Вислобоков", "Вислогузов", "Вислоусов", "Вислоухов", "Витебский", "Витенев", "Витошкин", "Витушкин", "Витютнев", "Витязев", "Вифлиемский", "Вихарев", "Вихирев", "Вихляев", "Вихорев", "Вихров", "Вицентьев", "Вицин", "Вицын", "Вичеслов", "Вичин", "Вишнев", "Вишневецкий", "Вишневский", "Вишня", "Вишняков", "Владимиров", "Владимирский", "Владимирцев", "Владыкин", "Владычин", "Владычкин", "Владычнев", "Влазнев", "Власевич", "Власенко", "Власенков", "Власин", "Власкин", "Власов", "Власьев", "Власюк", "Влахов", "Влашин", "Внифатьев", "Внук", "Внуков", "Внутских", "Вовк", "Вовкович", "Вовкогон", "Вовкогонов", "Вовочкин", "Вовчко", "Водеников", "Водкин", "Водовозов", "Водолага", "Водолагин", "Водолажский", "Водолазко", "Водолазов", "Водолазский", "Водоносов", "Водопьянов", "Водорезов", "ВодохлЯбов", "Водохлебов", "Воевода", "Воеводин", "Воеводкин", "Воейков", "Воейковых", "Военгский", "Воецкий", "Вожеватов", "Вожейко", "Вожик", "Возгрев", "Возгривый", "Воздвиженский", "Вознесенский", "Возницын", "Возняк", "Возчиков", "Возщиков", "Воинов", "Воинский", "Воинцев", "Войников", "Войнич", "Войнов", "Войновский", "Войтаскевич", "Войтенков", "Войтехов", "Войтеховский", "Войтко", "Войтов", "Войтович", "Войцехов", "Войцеховский", "Волгин", "Волдавин", "Волжанин", "Волжанкин", "Волжский", "Волик", "Воликов", "Волкобоев", "Волкобой", "Волков", "Волкович", "Волковысский", "Волкогонов", "Волкодаев", "Волкоедов", "Волколаков", "Волкоморов", "Волконский", "Волкопялов", "Волнин", "Волнотепов", "Волобуев", "Воловик", "Воловиков", "Воловников", "Вологдин", "Вологжанин", "Вологжанинов", "Володарский", "Володенков", "Володимиров", "Володин", "Володич", "Володичев", "Володькин", "Волокитин", "Волокушин", "Волосатов", "Волосатый", "Волосевич", "Волоснов", "Волостнов", "Волостных", "Волотич", "Волох", "Волохов", "Волоцкий", "Волочаев", "Волочанинов", "Волоченинов", "Волошанинов", "Волошенинов", "Волошенко", "Волошин", "Волошинов", "Волошиновський", "Волошкин", "Волошков", "Волхонский", "Волхонцев", "Волчанинов", "Волчек", "Волчик", "Волчков", "Волынец", "Волынский", "Волынцев", "Волынчук", "Вольнов", "Вольный", "Вольский", "Вольских", "Вонифатов", "Вонифатьев", "Вонлярлярский", "Воргин", "Ворищев", "Воробей", "Воробейчик", "Воробейчиков", "Воробец", "Воробин", "Воробьев", "Воровский", "Ворожбитов", "Ворожейкин", "Ворожищев", "Воронецкий", "Воронин", "Воронихин", "Вороницын", "Воронич", "Воронкин", "Воронков", "Воронов", "Воронович", "Вороной", "Воронцов", "Ворончихин", "Воронько", "Вороняев", "Воропаев", "Воропанов", "Воротилин", "Воротилов", "Воротнев", "Воротников", "Воротынский", "Воротынцев", "Ворохобин", "Ворохобов", "Ворошило", "Ворошилов", "Ворфаламеев", "Ворыпаев", "Воскобойник", "Воскобойников", "Воскресенский", "Востоков", "Вострецов", "Востриков", "Вострилов", "Востров", "Востроглазов", "Вострокнутов", "Вострокопытов", "Востропятов", "Востросаблин", "Востряков", "Вотяков", "Вохменцев", "Вохмин", "Вохминцев", "Вохмянин", "Вошкин", "Вощиков", "Вощинин", "Воякин", "Вревский", "Врубель", "Врублевский", "Всеволодов", "Всеволожский", "Всеславин", "Всехсвятский", "Вторак", "Вторников", "Второв", "Вторушин", "Вторый", "Вуколкин", "Вуколов", "Вучетич", "Выборнов", "Выгодский", "Выготский", "Выдрин", "Выжленков", "Выжлецов", "Вылегжанин", "Вылегжанинов", "Выморков", "Выпов", "Выповский", "Выростов", "Вырошников", "Вырубов", "Вырыпаев", "Выскубов", "Высокий", "Высоких", "Высоков", "Высокович", "Высокоостровский", "Высоцкий", "Вытчиков", "Выходцев", "Вычегжанин", "Вычегжанинов", "Вышегородцев", "Вышеградский", "Вышеславцев", "Вышняков", "Вьюниченко", "Вьюрков", "Вьющенко", "Вязгин", "Вязгунов", "Вяземский", "Вяземцев", "Вязников", "Вязов", "Вязовкин", "Вязовой", "Вязьмитин", "Вязьмитинов", "Вялов", "Вяльцев", "Вяткин", "Вятков", "Вятчинин", "Вяхирев", "Вяхорев", "Вячеславлев", "Вячеславов", "", "Габдулхаев", "Гавендяев", "Гавердовский", "Гавешин", "Гавренев", "Гавриков", "Гавриленко", "Гаврилин", "Гаврилихин", "Гавриличев", "Гаврилов", "Гавриловец", "Гаврилюк", "Гавриш", "Гавришев", "Гавришин", "Гавришов", "Гаврищев", "Гаврутин", "Гаврюшев", "Гавшиков", "Гавшин", "Гавшуков", "Гаганов", "Гагарин", "Гагин", "Гагрин", "Гаджибеков", "Гаджиев", "Гаев", "Гаевский", "Газизов", "Гайдай", "Гайдамакин", "Гайдаров", "Гайдаш", "Гайдук", "Гайдукевич", "Гайдуков", "Гайдученко", "Гайдучик", "Гайдучкин", "Гайдучков", "Гайдушенко", "Галаганов", "Галаев", "Галактионов", "Галактонов", "Галамов", "Галанин", "Галаничев", "Галанкин", "Галанов", "Галаншин", "Галасеин", "Галахов", "Галашев", "Галашов", "Галенко", "Галигузов", "Галиев", "Галикарнакский", "Галимов", "Галин", "Галицкий", "Галицын", "Галич", "Галиченин", "Галкин", "Галочкин", "Галузин", "Галушин", "Галушкин", "Галченков", "Галыгин", "Галыкин", "Гальченко", "Гальянов", "Гамаюнов", "Гамбаров", "Гамбурцев", "Гамзин", "Гамзов", "Гамзулин", "Гамов", "Гандурин", "Гандыбин", "Ганиев", "Ганин", "Ганихин", "Ганицев", "Ганичев", "Ганичкин", "Ганкин", "Ганночка", "Ганнусин", "Ганнушкин", "Гантемиров", "Ганусов", "Ганцев", "Ганшин", "Ганькин", "Ганюшкин", "Гапеев", "Гапоненко", "Гапонов", "Гапошкин", "Гаранин", "Гараничев", "Гарасеев", "Гарасимов", "Гарасин", "Гарашин", "Гарбузов", "Гарденин", "Гареев", "Гарин", "Гаринов", "Гарипов", "Гаркавый", "Гарканов", "Гаркунов", "Гаркуша", "Гарманов", "Гарусов", "Гаршин", "Гарьканов", "Гарькуша", "Гасаненко", "Гасанов", "Гаспарян", "Гашенко", "Гашин", "Гашкин", "Гашков", "Гашунин", "Гащенко", "Гвоздарев", "Гвоздев", "Гвоздь", "Гедеонов", "Геликонский", "Генадиников", "Генадьев", "Генералов", "Гениев", "Генин", "Генкин", "Геннадьев", "Генулин", "Георгиев", "Георгиевский", "Гераклидов", "Гераков", "Геранин", "Гераничев", "Геранькин", "Герасев", "Герасименко", "Герасимов", "Герасимюк", "Герасин", "Гераскин", "Герасов", "Герасютин", "Герахов", "Геращенко", "Герман", "Германов", "Германовский", "Германюк", "Герцен", "Герчухин", "Гешин", "Гиацинтов", "Гидаспов", "ГилЯв", "Гилев", "Гиляров", "Гиляровский", "Гиндин", "Гиперборейский", "Гиреев", "Гитин", "Гиткин", "Гитлин", "Гитник", "Глаголев", "Гладилин", "Гладилов", "Гладильщиков", "Гладкий", "Гладких", "Гладков", "Гладковский", "Гладцын", "Гладышев", "Глаз", "Глазатов", "Глазачев", "Глазеев", "Глазков", "Глазов", "Глазовой", "Глазоемцев", "Глазунов", "Глазырин", "Глафирин", "Глеб", "Глебков", "Глебов", "Глебушкин", "Глебычев", "Глезденев", "Глездунов", "Глезеров", "Глинка", "Глинский", "Глинских", "Глоткин", "Глотков", "Глотов", "Глубоковсих", "Глуздов", "Глуздырев", "Глумов", "Глумцов", "Глуханьков", "Глухарев", "Глухенький", "Глухий", "Глухих", "Глухов", "Глуховский", "Глухой", "Глухоманюк", "Глушак", "Глушаков", "Глушанков", "Глушенко", "Глушко", "Глущенко", "Глызин", "Глызов", "Гмарь", "Гмырин", "Гмыря", "Гнаткин", "Гнатов", "Гневашев", "Гневушев", "Гневышев", "Гнеушев", "Гнилицкий", "Гнилозуб", "Гнилозубов", "Гниломедов", "Гнилорыбов", "Гнилощеков", "Говендяев", "Говор", "Говорков", "Говоров", "Говорухин", "Говядин", "Говядинов", "Гогель", "Гоглачев", "Гоголев", "Гоголь", "Гоготов", "Гогунов", "Годовалов", "Годовиков", "Годовщиков", "Годун", "Годунов", "Голанов", "Голдобенков", "Голдобин", "Голев", "Големов", "Голендухин", "Голенищев", "Голец", "Голиборода", "Голик", "Голиков", "Голицын", "Голиченко", "Голичников", "Голландский", "Голландцев", "Голобокий", "Голобоких", "Голобоков", "Голобородов", "Головаков", "Голованев", "Голованов", "Головарев", "Головастиков", "Головастов", "Головастый", "Головач", "Головачев", "Головенкин", "Головешкин", "Головин", "Головкин", "Головко", "Головков", "Головленков", "Головнев", "Головнин", "Головушин", "Головушкин", "Головченко", "Головченков", "Головщиков", "Головяшкин", "Гологузов", "Голоднов", "Голодняк", "Голодов", "Голоколенко", "Гололобов", "Голомазов", "Голомозов", "Голомолзин", "Голомолзов", "Голоперов", "Голополосов", "Голопятин", "Голосеин", "Голоспинкин", "Голостенов", "Голотин", "Голоусиков", "Голоухов", "Голоушев", "Голоушин", "Голоушкин", "Голофтеев", "Голохвастов", "Голохвостов", "Голошубов", "Голощапов", "Голощеков", "Голуб", "Голубев", "Голубейко", "Голубин", "Голубинин", "Голубинов", "Голубинский", "Голубинцев", "Голубицкий", "Голубкин", "Голубков", "Голубов", "Голубович", "Голубовский", "Голубоцкий", "Голубушкин", "Голубцов", "Голубчик", "Голубятников", "Голузин", "Голутвин", "Голчин", "Голыгин", "Голышев", "Голышевский", "Голышкин", "Гольдин", "Гольцев", "Гольцов", "Голягин", "Голядкин", "Голямов", "Гомбоев", "Гомбурцев", "Гомеров", "Гомзиков", "Гомзин", "Гомзяков", "Гомозин", "Гомозов", "Гомоюнов", "Гондобин", "Гондырев", "Гонимедов", "Гонобобелев", "Гонобоблев", "Гонохов", "Гоношилин", "Гоношин", "Гоношихин", "Гонтарев", "Гонтаров", "Гонтарук", "Гонтарь", "Гонцов", "Гончар", "Гончаренко", "Гончарик", "Гончаров", "Гончарук", "Гораздов", "Горбаневский", "Горбань", "Горбатко", "Горбатков", "Горбатов", "Горбатый", "Горбатых", "Горбач", "Горбачев", "Горбачевский", "Горбаченко", "Горбенко", "Горбенков", "Горбов", "Горбоносов", "Горбунин", "Горбунков", "Горбунов", "Горбунчиков", "Горбушин", "Горбушов", "Горбышев", "Горгошин", "Горгошкин", "Горданов", "Гордеев", "Гордеенко", "Гордейчик", "Гордейчук", "Горденин", "Гордиев", "Гордиенко", "Гордин", "Гордов", "Гордусь", "Гордый", "Гордых", "Гордягин", "Горев", "Горелик", "Гореликов", "Горелкин", "Горелов", "Горелый", "Горелых", "Горемыкин", "Горетов", "Горизонтов", "Горин", "Горихвостков", "Горихвостов", "Горкин", "Горкунов", "Горланцев", "Горлатов", "Горлачев", "Горленко", "Горлин", "Горлов", "Горлохватов", "Горн", "Горний", "Горностаев", "Горный", "Горных", "Горобец", "Горовой", "Городецкий", "Городзенский", "Городков", "Городников", "Городничев", "Городниченков", "Городнов", "Городов", "Городовиков", "Городской", "Городчанинов", "Горожанкин", "Горожанцев", "Горохов", "Гороховников", "Гороховский", "Горошко", "Горошков", "Горошников", "Горский", "Горталов", "Горчаков", "Горшенин", "Горшечников", "Горшин", "Горшкалев", "Горшков", "Горьков", "Горьковенко", "Горьковых", "Горюнков", "Горюнов", "Горюшкин", "Горяев", "Горяинов", "Горяйнов", "Горячев", "Горячих", "Горячкин", "Гостев", "Гостемилов", "Гостенков", "Гостенов", "Гостинников", "Гостинодворцев", "Гостинщиков", "Гостихин", "Гостищин", "Гостюнин", "Гостюхин", "Гостюшин", "Готовцев", "Готовцов", "Гошев", "Грабарев", "Грабаров", "Грабарь", "Грабовский", "Гражданинов", "Гражданкин", "Гранатов", "Гранев", "Гранин", "Гранкин", "Гранков", "Гранов", "Грановский", "Гранькин", "Граудин", "Графинин", "Графов", "Графский", "Грацианский", "Грач", "Грачев", "Граченков", "Грачков", "Гребельский", "Гребенев", "Гребенкин", "Гребенников", "Гребенцов", "Гребенчиков", "Гребенщиков", "Гребенюк", "Гребенюков", "Гребнев", "Гребнчук", "Гредякин", "Греков", "Гренадеров", "Гренадерский", "Грехов", "Греховодов", "Греходоводов", "Гречаников", "Гречанинов", "Гречановский", "Греченинов", "Гречихин", "Гречищев", "Гречнев", "Гречневиков", "Грешников", "Грешнов", "Гриб", "Грибакин", "Грибан", "Грибанин", "Грибанов", "Грибачев", "Грибков", "Грибов", "Грибоедов", "Грибунин", "Грибушин", "Грибцов", "Гривенников", "Григанов", "Григоренко", "Григоркин", "Григоров", "Григорук", "Григорушкин", "Григорьев", "Григорьевский", "Григорьичев", "Гридасов", "Гриденков", "Гридин", "Гриднев", "Гриднин", "Гридунов", "Гридякин", "Гризодубов", "Гринев", "Гриневич", "Гриневский", "Гриненко", "Гринин", "Грининов", "Гринихин", "Гринишин", "Гринкин", "Гринков", "Гринников", "Гринцов", "Гринчишин", "Гринь", "Гриньков", "Гриняев", "Гринякин", "Гриппа", "Гриппенко", "Гриханов", "Грихнов", "Грицаенко", "Грицай", "Грицан", "Гриценко", "Грицких", "Грицко", "Грицков", "Грицов", "Грицунов", "Гричаев", "Гричухин", "Гришагин", "Гришаев", "Гришакин", "Гришаков", "Гришанин", "Гришанков", "Гришанов", "Гришанович", "Гришелев", "Гришенков", "Гришечкин", "Гришин", "Гришинов", "Гришко", "Гришков", "Гришманов", "Гришочков", "Гришуков", "Гришунин", "Гришутов", "Гришухин", "Грищанин", "Грищено", "Грободеров", "Гробожилов", "Гродзенский", "Громов", "Громыкин", "Громыко", "Громыхалов", "Гроховский", "Гроховской", "Грошев", "Грошевик", "Грошиков", "Грошов", "Грудинский", "Грудистов", "Груднев", "Груздев", "Груздов", "Грузинов", "Грузинцев", "Грунин", "Грушаков", "Грушанин", "Грушевский", "Грушенков", "Грушин", "Грушицкий", "Грушков", "Грязев", "Грязнов", "Грязнухин", "Губа", "Губанин", "Губанов", "Губарев", "Губарихин", "Губатов", "Губатый", "Губачевский", "Губернаторов", "Губин", "Губкин", "Губко", "Губонин", "Гуд", "Гудаев", "Гудзеев", "Гудзий", "Гудимов", "Гудков", "Гудов", "Гудошников", "Гузанин", "Гузатин", "Гузеев", "Гузенко", "Гузин", "Гузнищев", "Гузов", "Гузунов", "Гуков", "Гулин", "Гульдин", "Гуляев", "Гуляйвитер", "Гуляков", "Гуменников", "Гумилев", "Гумилевский", "Гундарев", "Гундобин", "Гундорин", "Гундоров", "Гур", "Гуреев", "ГурилЯв", "Гурин", "Гуринов", "Гуринович", "Гуричев", "Гурков", "Гурнов", "Гуров", "Гурченко", "Гурченков", "Гурьев", "Гурьнев", "Гурьянов", "Гусак", "Гусаков", "Гусев", "Гусейнов", "Гусельников", "Гусельщиков", "Гусенков", "Гуслистый", "Гусляров", "Гусынин", "Гусь", "Гуськов", "Гусятников", "Гутников", "Гутов", "Гучков", "Гущеедов", "Гущин", "Гырлов", "", "Давиденко", "Давидов", "Давидович", "Давидчук", "Давидюк", "Давидяк", "Давлетов", "Давыденко", "Давыденков", "Давыди", "Давыдив", "Давыдкин", "Давыдков", "Давыдов", "Давыдовкий", "Давыдочкин", "Давыдычев", "Дагуров", "Дайнеко", "Далматов", "Дамаскинский", "Дамбинов", "Дамский", "Дан", "Данилевич", "Данилевский", "Данилейко", "Даниленко", "Данилин", "Данилихин", "Даниличев", "Данилишин", "Данилкин", "Данилко", "Данилов", "Данилович", "Даниловский", "Данилычев", "Данильцев", "Данильчев", "Данильченко", "Данильчик", "Данильчук", "Данилюк", "Даниляк", "Данич", "Данишевич", "Данишевский", "Данишкин", "Данкин", "Данков", "Данов", "Данович", "Данчев", "Данченко", "Данченков", "Данчиков", "Данчин", "Данчук", "Даншин", "Данщин", "Даньков", "Даньшин", "Данюк", "Данюков", "Данюшевский", "Даргомыжский", "Дарзин", "Дариев", "Дарий", "Дарьев", "Дарьин", "Дарюсин", "Даудов", "Дахнов", "Дашин", "Дашкевич", "Дашкин", "Дашко", "Дашков", "Дашковский", "Дашук", "Двинских", "Двинянин", "Двинятин", "Двойрин", "Дворецкий", "Дворецков", "Дворкин", "Дворник", "Дворников", "Дворянинов", "Дворянкин", "Двоскин", "Дебольский", "Деборин", "Дебособров", "Девахин", "Девин", "Девицын", "Девичев", "Девкин", "Девонин", "Девочкин", "Девулин", "Девунин", "Девушкин", "Девьятов", "Девятаев", "Девятайкин", "Девятериков", "Девятинин", "Девяткин", "Девятков", "Девятнин", "Девятов", "Девятое", "Девятых", "Девятьяров", "Девяшин", "Деготь", "Дегтев", "Дегтеренко", "Дегтяр", "Дегтярев", "Дегтяренко", "Дегтярников", "Дегтярь", "Деденев", "Дедерев", "Дедик", "Дедиков", "Дедичев", "Дедков", "Дедковский", "Дедов", "Дедое", "Дедуков", "Дедулин", "Дедухов", "Дедушев", "Дедушкин", "Дедюлин", "Дедюнин", "Дедюхин", "Деев", "Дежин", "Дежнев", "Дейнега", "Дейнека", "Дейнекин", "Делекторский", "Демакин", "Демаков", "Демашин", "Деменев", "Деменков", "Дементьев", "Деменчук", "Демехин", "Демешин", "Демешка", "Демешко", "Демидас", "Демидась", "Демиденко", "Демиденок", "Демидков", "Демидов", "Демидовец", "Демидович", "Демидовский", "Демидовцев", "Демин", "Деминов", "Демихов", "Демичев", "Демишев", "Демкин", "Демков", "Демосфенов", "Демулин", "Демусев", "Демчев", "Демченко", "Демченский", "Демчик", "Демчинят", "Демчук", "Демшин", "Демыкин", "Демышев", "Демьяненко", "Демьянец", "Демьянов", "Демьяновский", "Демьянок", "Демьянчук", "Демяник", "Демянко", "Демянов", "Демяновский", "Деникин", "Денисевич", "Денисенко", "Денисов", "Денисович", "Денисычев", "Денисьев", "Денисюк", "Денюхин", "Денягин", "Денякин", "Деплоранский", "Депутатов", "Дербенев", "Дербин", "Дербышев", "Дергачов", "Деревщиков", "Деревягин", "Деревянкин", "Деревянников", "Деревяшкин", "Державец", "Державин", "Державцев", "Дерикорчма", "Деркач", "Деркачов", "Дерюгин", "Дерябин", "Дерягин", "Десницкий", "Десяткин", "Десятов", "Детистов", "Деткин", "Детков", "Детнев", "Деточкин", "Детушкин", "Деулин", "Дехтерев", "Дехтярев", "Дешин", "Джавадов", "Джиоев", "Джура", "Дзенискевич", "Дзюбин", "Дианин", "Дианов", "Диденко", "Дидоренко", "Дидур", "Дидушко", "Диев", "Дикушин", "Дилигенский", "Димитриев", "Димитров", "Димитрович", "Димов", "Димуров", "Диодоров", "Диомидов", "Дионисов", "Дионисьев", "Дитятин", "Диянов", "Дмитерко", "Дмитрев", "Дмитренко", "Дмитриев", "Дмитриевский", "Дмитриенко", "Дмитричев", "Дмитриченко", "Дмитро", "Дмитроченко", "Дмитрук", "Днепровский", "Добин", "Добрецов", "Добров", "Добровольский", "Добродеев", "Добролюбов", "Добромыслов", "Доброноженко", "Добронравов", "Добросмыслов", "Добротворский", "Добрый", "Добрынин", "Добрыничев", "Добрынкин", "Добрынский", "Добрынченко", "Добрых", "Добрышев", "Добряков", "Довгалевский", "Довгаль", "Довгалюк", "Довгань", "Довгий", "Доверов", "Довыденко", "Догоног", "Додон", "Додонов", "Додул", "Доилицын", "Доильницын", "Докукин", "Документов", "Докунин", "Докучаев", "Долганов", "Долгачев", "Долгирев", "Долгих", "Долгобородов", "Долгов", "Долгодумов", "Долгожилов", "Долголюк", "Долгоногов", "Долгонос", "Долгоносов", "Долгоплоск", "Долгополов", "Долгопольский", "Долгопятов", "Долгорожев", "Долгорукий", "Долгоруков", "Долгостинов", "Долгошеев", "Долгошея", "Долгушев", "Долгушин", "Должиков", "Долин", "Долматов", "Доломанов", "Дольников", "Домарев", "Домахин", "Домашкевич", "Домашнев", "Домашников", "Домашов", "Домерников", "Домерщиков", "Домников", "Домнин", "Домничев", "Домнов", "Домовиков", "Домовитов", "Доможилов", "Доможиров", "Домрачев", "Домрачеев", "Домрачов", "Дондуков", "Донец", "Донин", "Донич", "Донов", "Донских", "Донсков", "Донской", "Донцов", "Дориков", "Дорин", "Доркин", "Дородницын", "Дороднов", "Дородных", "Дорожкин", "Доронин", "Дорофанин", "Дорофанкин", "Дорофанов", "Дорофеев", "Дорохеев", "Дорохин", "Дорохов", "Дорош", "Дорошаев", "Дорошев", "Дорошевич", "Дорошевский", "Дорошенко", "Дорошин", "Дорошко", "Доставалов", "Достоевский", "Дохтуров", "Драгунов", "Дранишников", "Драч", "Драчев", "Драченко", "Драчунов", "Драшусов", "Дресвянкин", "Дробноходов", "Дроботов", "Дробушевский", "Дробыш", "Дробышев", "Дрозд", "Дрозденко", "Дроздов", "Дроздович", "Дронин", "Дронкин", "Дронников", "Дронов", "Другов", "Дружинин", "Дружкин", "Дружков", "Дружников", "Друзин", "Друзякин", "Друзяков", "Друнин", "Дрягин", "Дубасов", "Дубенкин", "Дубенский", "Дубенсков", "Дубина", "Дубинин", "Дубинкин", "Дубинский", "Дубинушкин", "Дубихин", "Дубков", "Дубнев", "Дубников", "Дубницкий", "Дубниченко", "Дубняков", "Дубов", "Дубовец", "Дубовик", "Дубовиков", "Дубовицкий", "Дубовой", "Дубовский", "Дубовцев", "Дубовчук", "Дубонос", "Дубоносов", "Дубров", "Дубровин", "Дубровниский", "Дубровский", "Дубровских", "Дугин", "Дудаков", "Дударев", "Дударенко", "Дударов", "Дудин", "Дудинский", "Дудинцев", "Дудка", "Дудкин", "Дудко", "Дудник", "Дудников", "Дудок", "Дудоладов", "Дудоров", "Дудченко", "Дудыкин", "Дудырин", "Дудышкин", "Дулебов", "Дулев", "Дулепов", "Дулов", "Дульский", "Дунаев", "Дунаевский", "Дунаевцев", "Дунайский", "Дундуков", "Дунин", "Дураев", "Дураков", "Дураковский", "Дурасов", "Дуринов", "Дурнев", "Дурнин", "Дурнов", "Дурновцев", "Дуров", "Дурыгин", "Дурылин", "Дурындин", "Дурышкин", "Дурягин", "Дутиков", "Дутов", "Духнович", "Духовской", "Душин", "Душкин", "Дыбайло", "Дымкин", "Дымков", "Дымников", "Дымов", "Дынин", "Дьяков", "Дьяконов", "Дьяченко", "Дьячихин", "Дьячков", "Дюдин", "Дюжев", "Дюжов", "Дюкарев", "Дюкин", "Дюков", "Дюригин", "Дягилев", "Дядин", "Дядищев", "Дядькин", "Дядьков", "Дядьковский", "Дядюгин", "Дядюн", "Дядюшкин", "Дядянин", "Дякон", "Дятлов", "Дяченко", "", "Евгеев", "Евгенов", "Евгеньев", "Евгранов", "Евграфов", "Евграшин", "Евдакимов", "Евдаков", "Евдокименко", "Евдокимов", "Евдонин", "Евдохин", "Евдошин", "Евклидов", "Евлампиев", "Евлампьев", "Евланин", "Евланов", "Евлахин", "Евлахов", "Евлашев", "Евлашин", "Евлашкин", "Евлашов", "Евлентьев", "Евлонин", "Евмененко", "Евменов", "Евментьев", "Евменьев", "Евпалов", "Евпатов", "Евпланов", "Евплов", "Евпсихеев", "Евреев", "Евреинов", "Евсеев", "Евсеенко", "Евсеенков", "Евсеичев", "Евсейкин", "Евсеков", "Евсенков", "Евсиков", "Евсин", "Евстафьев", "Евстахов", "Евстигнеев", "Евстифеев", "Евстифоров", "Евстихеев", "Евстратенко", "Евстратов", "Евстратьев", "Евстропов", "Евстюгин", "Евстюгов", "Евстюничев", "Евстюхин", "Евстюшин", "Евсюков", "Евсюнин", "Евсютин", "Евсюткин", "Евсюхин", "Евсюшин", "Евсюшкин", "Евтеев", "Евтехеев", "Евтехов", "Евтин", "Евтифеев", "Евтихиев", "Евтихов", "Евтихьев", "Евтропов", "Евтух", "Евтухов", "Евтушек", "Евтушенко", "Евтушик", "Евтюгин", "Евтюнин", "Евтюничев", "Евтютин", "Евтютов", "Евтюхов", "Евтюшкин", "Евтяев", "Еганов", "Егерев", "Егин", "Еголин", "Егонин", "Егоренко", "Егоренков", "Егорин", "Егорихин", "Егоркин", "Егорков", "Егорнов", "Егоров", "Егоровнин", "Егорочкин", "Егорушкин", "Егорченков", "Егоршин", "Егорычев", "Егорьев", "Егошин", "Егунин", "Егунов", "Едвабник", "Едемский", "Едовин", "Едомский", "Ежевикин", "Ежиков", "Ежков", "Ежов", "Ежовский", "Езерский", "Екатеринин", "Екатерининский", "Екатеринославский", "Екдитов", "Екименко", "Екимкин", "Екимов", "Екимовский", "Екотов", "Елагин", "Еланин", "Еланский", "Елатомцев", "Елахов", "Елдонин", "Елеазаров", "Елеманов", "Еленев", "Еленин", "Еленкин", "Еленчук", "Елеонский", "Елесин", "Елеферьев", "Елецких", "Елизаветин", "Елизаров", "Елизарьев", "Еликов", "Елин", "Елисеев", "Елисов", "Елистратов", "Елихин", "Елишин", "Елкин", "Елохин", "Елохов", "Елпатов", "Елпатьев", "Елпатьевский", "Елпидин", "Елукин", "Елухин", "Елчев", "Елчин", "Елшин", "Елькин", "Ельков", "Ельманов", "Ельфимов", "Ельцин", "Ельцын", "Ельчанинов", "Ельшанов", "Ельшин", "Ельянов", "Елютин", "Еляков", "Еманов", "Емелин", "Емеличев", "Емелькин", "Емельченко", "Емельчиков", "Емельяненко", "Емельяненков", "Емельянович", "Емельянцев", "Емельянчиков", "Емелюшкин", "Емцов", "Емчанинов", "Емшанов", "Емяшев", "Енакиев", "Еникеев", "Енин", "Енохин", "Ентальцев", "Енько", "Еньков", "Енютин", "Енюшин", "Еоахтин", "Епанечников", "Епанешников", "Епанчин", "Епанчинцев", "Епешин", "Епифанов", "Епифаньев", "Епихин", "Епишев", "Епишин", "Епишкин", "Епищев", "Ераков", "Еранцев", "Ерастов", "Ерахов", "Ерахтин", "Ерашев", "Ергаев", "Ергаков", "Ергачев", "Ергин", "Ергольский", "Еремеев", "Еременко", "Еременков", "Еремин", "Еремичев", "Еремкин", "Еремко", "Еремушкин", "Еремцов", "Еремченко", "Еремчук", "Ерилин", "Ерилов", "Ерин", "Ерихов", "Еркин", "Ерков", "Ерлыкалов", "Ерлыченков", "Ермак", "Ермаков", "Ермакович", "Ермаченков", "Ермачков", "Ермашов", "Ермилин", "Ермилов", "Ермин", "Ермихин", "Ермичев", "Ермишев", "Ермишин", "Ермишкин", "Ермоденко", "Ермолаев", "Ермолин", "Ермолинский", "Ермолкевич", "Ермолов", "Ермохин", "Ермошин", "Ермошкин", "Ермушин", "Ермушов", "Ерогин", "Еронин", "Еронов", "Еропкин", "Еропов", "Еротидин", "Ерофеев", "Ерофеевский", "Ерофеенко", "Ероханов", "Ерохин", "Ерохов", "Ерошев", "Ерошевский", "Ерошенко", "Ерошин", "Ерошкин", "Ерушевич", "Ерхов", "Ершаков", "Ершин", "Ершихин", "Ершов", "Ерыгин", "Ерыкалин", "Ерыкалов", "Ерюхин", "Ерюшев", "Есаулов", "Есафов", "Есенев", "Есенин", "Есин", "Есинин", "Есинов", "Есип", "Есипенко", "Есипенков", "Есипов", "Есичев", "Ескин", "Естигнеев", "Естифеев", "Еськин", "Еськов", "Ефанин", "Ефанов", "Ефиманов", "Ефименко", "Ефимов", "Ефимович", "Ефимочкин", "Ефимушкин", "Ефимцев", "Ефимцов", "Ефимычев", "Ефимьев", "Ефишев", "Ефременко", "Ефремкин", "Ефремов", "Ефремовцев", "Ефремушкин", "Ефросимов", "Ефросинов", "Ефтефеев", "Ефтифеев", "Ечеистов", "Ечменев", "Ешков", "Ешурин", "", "Жаба", "Жабенков", "Жабин", "Жабинский", "Жабко", "Жабоедов", "Жабрак", "Жабров", "Жабрук", "Жаворонков", "Жаврук", "Жаданов", "Жаденов", "Жаднов", "Жадный", "Жадобин", "Жадов", "Жадовский", "Жаков", "Жалобин", "Жальба", "Жандр", "Жаравин", "Жаравихин", "Жаравлев", "Жаренов", "Жареный", "Жариков", "Жарин", "Жарких", "Жарков", "Жаров", "Жаровский", "Жарун", "Жбанков", "Жбанников", "Жбанов", "Жваликовский", "Жвалов", "Жданеня", "Жданкин", "Жданов", "Жданович", "Ждахин", "Жебов", "Жебра", "Жебраков", "Жебрун", "Жебрунов", "Жевакин", "Жевнеров", "Жевнин", "Жегалин", "Жегалов", "Жеглов", "Жегулев", "Жегулин", "Желагин", "Желваков", "Желватых", "Желвачев", "Желдаков", "Железников", "Железнов", "Железный", "Железняк", "Железняка", "Железняков", "Желнин", "Желнинский", "Желтиков", "Желтобрюхов", "Желтов", "Желтоногов", "Желтоножкин", "Желтоножко", "Желтонос", "Желторот", "Желтоухов", "Желтухин", "Желтышев", "Желтышов", "Желтяков", "Желудев", "Желыбин", "Желябов", "Жемчугин", "Жемчугов", "Жемчужников", "Жемчужный", "Женин", "Жеравкин", "Жердев", "Жеребилов", "Жеребцов", "Жеребятев", "Жеребятичев", "Жеребятников", "Жеребятов", "Жеребятьев", "Жерехов", "Жерздев", "Жерлицын", "Жерлов", "Жерноков", "Жерносек", "Жехов", "Жженов", "Жженый", "Живаго", "Живейнов", "Живов", "Живоглотов", "Живодеров", "Живоедов", "Живой", "Живописцев", "Животко", "Животов", "Живчиков", "Живягин", "Живяго", "Жигайлов", "Жигалев", "Жигалин", "Жигалов", "Жиганов", "Жигарев", "Жигачев", "Жигин", "Жиглов", "Жигулев", "Жигулин", "Жигунов", "Жидик", "Жидкий", "Жидких", "Жидков", "Жидконожкин", "Жидовинов", "Жидович", "Жидовский", "Жидовцев", "Жилеев", "Жилейкин", "Жилин", "Жилинский", "Жилкин", "Жилко", "Жилунович", "Жильцов", "Жиляков", "Жимерин", "Жириновский", "Жиркевич", "Жирков", "Жирнов", "Жирняк", "Жиров", "Жировкин", "Жировой", "Жирошкин", "Жиряков", "Житарев", "Житин", "Житков", "Житников", "Житный", "Житов", "Житомирский", "Жихарев", "Жичастов", "Жмайлов", "Жмакин", "Жмейда", "Жмурин", "Жмуров", "Жовкин", "Жовнер", "Жовнеренко", "Жовнерчик", "Жовтобрюх", "Жолнерович", "Жолнин", "Жолобов", "Жолудев", "Жолудь", "Жорав", "Жорин", "Жохов", "Жубаркин", "Жуйков", "Жук", "Жукевич", "Жуков", "Жуковец", "Жукович", "Жуковский", "Жулев", "Жулидов", "Жуликов", "Жулин", "Жунин", "Жупанов", "Жур", "Журавель", "Журавкин", "Журавков", "Журавлев", "Журавок", "Журавский", "Жураев", "Журак", "Журба", "Журбенко", "Журбин", "Журик", "Журихин", "Журичев", "Журишкин", "Журкин", "Журов", "Журович", "Жученко", "Жучкевич", "", "Забава", "Забавин", "Забалканский", "Забалуев", "Забегаев", "Забелин", "Забиякин", "Заблоцкий", "Заболеев", "Заболотников", "Заболотный", "Заболоцкий", "Заборкин", "Заборов", "Заборовский", "Заборских", "Заботин", "Заботкин", "Забродин", "Забродов", "Забузов", "Забусов", "Забылин", "Завадовский", "Завадский", "Завалишин", "Заварзин", "Заварихин", "Завгородний", "Завесин", "Завескин", "Заводчиков", "Завольский", "Заворуев", "Завражнов", "Завражный", "Завьялов", "Загайнов", "Загваздин", "Загибалов", "Загоняйлов", "Загороднов", "Загородный", "Загородных", "Загоскин", "Загребаев", "Загребельный", "Загребельский", "Загряжский", "Загубисундук", "Загудаев", "Загудалов", "Загуляев", "Загустин", "Задачин", "Задеренко", "Задерихин", "Задеря", "Задорин", "Задорнов", "Задоров", "Задорожный", "Заев", "Заевский", "Зажигин", "Зажогин", "Зазиркин", "Заика", "Заикин", "Зайкин", "Зайонцковский", "Зайцев", "Зайченко", "Зайчиков", "Зайчихин", "Заказников", "Закамский", "Закамсков", "Закатов", "Закревский", "Закржевский", "Закривидорога", "Закройщиков", "Закруткин", "Закурдаев", "Закусов", "Закутин", "Залежнев", "Залеский", "Залесский", "Заливахин", "Залога", "Залогин", "Заложный", "Заложных", "Заломаев", "Заломов", "Залтоустов", "Залужный", "Залуцкий", "Залыгин", "Заморов", "Замотаев", "Замотайлов", "Замошкин", "Замощин", "Замятин", "Замятнин", "Занозин", "Заозерский", "Заонегин", "Заостровцев", "Западов", "Запивалов", "Запивахин", "Заплатин", "Заплаткин", "Заплатов", "Запольский", "Запоров", "Запорцов", "Зарайский", "Заремба", "Зарецкий", "Зарин", "Зарницкий", "Зародов", "Зарубин", "Зарудин", "Заруцкий", "Заседателев", "Засекин", "Засецкий", "Застолбский", "Засурский", "Засурцев", "Засыпкин", "Захаревич", "Захаренко", "Захаренков", "Захариков", "Захарин", "Захаркин", "Захаров", "Захарочкин", "Захарук", "Захарцев", "Захарченко", "Захарченков", "Захарченок", "Захарченя", "Захарчук", "Захарычев", "Захарьев", "Захарьин", "Захаьянец", "Захидов", "Зацепилин", "Зацепин", "Зачесломский", "Зашибалов", "Заяицкий", "Заякин", "Заяц", "Зборовский", "Зборщиков", "Званцев", "Звегинцев", "Звезда", "Звездилин", "Звездкин", "Звездочетов", "Звездочкин", "Звенигородский", "Зверев", "Звержховский", "Звонарев", "Звонков", "Звонцов", "Зворыгин", "Зворыкин", "Звягин", "Звягинцев", "Здоровов", "Здоровцев", "Здоровцов", "Здрецов", "Зевакин", "Зевахин", "Зегзюлин", "Зезюлин", "Зекзюлин", "Зеленин", "Зеленихин", "Зеленко", "Зеленков", "Зеленов", "Зеленский", "Зеленцов", "Зеленый", "Зелинский", "Зельдес", "Зельдин", "Зельдис", "Зельдович", "Зелькин", "Земляника", "Земляникин", "Земляницын", "Землянкин", "Землянов", "Земляной", "Землянский", "Земнов", "Земский", "Земских", "Земсков", "Земцев", "Земцов", "Зенбулатов", "Зенин", "Зенкевич", "Зенков", "Зенченко", "Зеньков", "Зеньковский", "Зенякин", "Зеркин", "Зернин", "Зернов", "Зернщиков", "Зеров", "Зерцалов", "Зерчанинов", "Зефиров", "Зехачев", "Зехнов", "Зехов", "Зименков", "Зимин", "Зимников", "Зимницын", "Зимовец", "Зимовский", "Зимовцев", "Зиневич", "Зинец", "Зинин", "Зиничев", "Зинкевич", "Зинкин", "Зиновенко", "Зинович", "Зиновичев", "Зиновьев", "Зинухин", "Зинченко", "Зинченков", "Зиньков", "Зинюкин", "Зинюхин", "Зиняков", "Зискин", "Зискис", "Зислин", "Златоверхов", "Златовратский", "Златоусов", "Златоустовский", "Злобин", "Злобкин", "Злобов", "Злобчев", "Зловидов", "Злоказов", "Злотников", "Злыгостев", "Злыднев", "Змеев", "Змиев", "Знаменский", "Знаменщиков", "Зобанов", "Зобачев", "Зобнин", "Зобов", "Зодиев", "Зозулин", "Золин", "Золкин", "Золотавин", "Золотарев", "Золотаревский", "Золотилов", "Золотников", "Золотов", "Золотой", "Золотопупов", "Золотухин", "Золотушников", "Золотых", "Зольников", "Зонин", "Зонов", "Зорин", "Зорич", "Зорькин", "Зосимов", "Зосимовский", "Зотагин", "Зотев", "Зотеев", "Зотиков", "Зотимов", "Зотин", "Зоткин", "Зотов", "Зотьев", "Зубакин", "Зубаков", "Зубарев", "Зубарь", "Зубаха", "Зубачев", "Зубенко", "Зубко", "Зубков", "Зубов", "Зубок", "Зуборев", "Зубцов", "Зудин", "Зуев", "Зуенков", "Зуйков", "Зуков", "Зуров", "Зыбин", "Зык", "Зыкин", "Зыков", "Зыкунов", "Зырин", "Зырянов", "Зырянцев", "Зыскин", "Зюганов", "Зюзин", "Зюряев", "Зябкин", "Зябликов", "Зяблицев", "Зяблов", "Зятев", "", "Ибрагимов", "Ивайкин", "Ивакин", "Иваков", "Иванаев", "Иванеев", "Иваненко", "Иваненков", "Иванец", "Иваников", "Иванилов", "Иванин", "Иванисов", "Иванихин", "Иваницкий-платонов", "Иваничев", "Иванишев", "Иванишин", "Иванишко", "Иванишын", "Иванищев", "Иванищук", "Иванкин", "Иванко", "Иванков", "Иванников", "Иванов", "Иванов-разумник", "Ивановец", "Иванович", "Ивановский", "Иванский", "Ивантеев", "Ивантей", "Ивантьев", "Иванусьев", "Иванушкин", "Иванцев", "Иванцов", "Иванченко", "Иванченков", "Иванчиков", "Иванчин", "Иванчихин", "Иванчов", "Иваншинцев", "Иванычев", "Иванышкин", "Иваньев", "Иванько", "Иваньков", "Иваньшин", "Иванюк", "Иванюков", "Иванютин", "Иванюшин", "Иванянков", "Ивасенко", "Ивасишин", "Ивахин", "Ивахненко", "Ивахно", "Ивахнов", "Ивахнушкин", "Ивачев", "Ивашев", "Ивашенцев", "Ивашечкин", "Ивашин", "Ивашиненко", "Ивашинников", "Ивашинцов", "Ивашишин", "Ивашкевич", "Ивашкин", "Ивашков", "ИвашнЯв", "Ивашников", "Ивашов", "Ивашутин", "Иващенко", "Иващенков", "Иверенев", "Ивин", "Ивкин", "Ивков", "Ивлев", "Ивлиев", "Ивличев", "Ивов", "Ивойлов", "Иволгин", "Ивонин", "Ивонов", "Ивочкин", "Ивошин", "Ивушкин", "Ивчатов", "Ивченко", "Ивченков", "Ившин", "Игин", "Иглин", "Игнасенков", "Игнатенко", "Игнатик", "Игнатиков", "Игнатин", "Игнатичев", "Игнатков", "Игнатов", "Игнатович", "Игнаточкин", "Игнатушкин", "Игнатчик", "Игнатьев", "Игнатьичев", "Игнатюк", "Игначенко", "Игначенков", "Игнашев", "Игнашин", "Игнин", "Иголкин", "Игольников", "Игонин", "Игошев", "Игошин", "Игренев", "Игрушин", "Игудин", "Игумнов", "Иделев", "Иделевич", "Иевлев", "Иегудин", "Иераксов", "Иерихонов", "Иеропольский", "Ижмяков", "Изборский", "Извеков", "Извицкий", "Извозчиков", "Извольский", "Извощиков", "Изгагин", "Изидин", "Измаилов", "Измайлов", "Износков", "Изотенко", "Изотенок", "Изотов", "Израилев", "Израилевич", "Изъединов", "Изюмов", "Иконник", "Иконников", "Иконостасов", "Иларионов", "Илизаров", "Илларионов", "Иллювцев", "Иловайский", "Ильенко", "Ильин", "Ильиничнин", "Ильинский", "Ильинцев", "Ильиных", "Ильичев", "Ильиченко", "Ильманов", "Ильченко", "Ильченков", "Ильчишин", "Ильчук", "Ильюк", "Ильюта", "Ильюшенко", "Ильюшин", "Ильюшкин", "Ильющенко", "Ильясов", "Ильяхин", "Ильяшев", "Ильяшевич", "Ильяшенко", "Илютин", "Илюхин", "Илюхов", "Илюшин", "Илюшкин", "Илющенко", "Инархов", "Индейкин", "Индюков", "Индюшкин", "Инешин", "Инжаков", "Инжеватов", "Инихин", "Инихов", "Инкин", "Инков", "Иннокентьев", "Иноземцев", "Инокентьев", "Инородцев", "Иносов", "Иностранцев", "Иноходцев", "Иношин", "Инсаров", "Инцернов", "Инцертов", "Инчин", "Иншаков", "Иншин", "Иньшин", "Инютин", "Инюшев", "Инюшин", "Иняков", "Иняхин", "Иняшев", "Иовенко", "Иовлев", "Иозефович", "Ионин", "Ионкин", "Ионов", "Ионтов", "Иорданский", "Иоселев", "Иоселович", "Иоффа", "Иоффе", "Ипаткин", "Ипатов", "Ипатовцев", "Ипатьев", "Иполитов", "Ипполитов", "Ипутатов", "Ирецкий", "Иринархов", "Иринеев", "Иринин", "Ирисов", "Ирошников", "Ирхин", "Исааков", "Исаев", "Исаенко", "Исаеня", "Исаин", "Исаичев", "Исайкин", "Исайков", "Исайчев", "Исаков", "Исаковский", "Исанин", "Исаченко", "Исаченков", "Исачков", "Исидоров", "Исмагилов", "Исмаилов", "Исправников", "Иссерлин", "Иссерлис", "Истархов", "Истефеев", "Истифеев", "Истомахин", "Истомин", "Истомов", "Истошин", "Истратов", "Истрахов", "Исупов", "Иськов", "Иулианов", "Ицков", "Ицын", "Ичеткин", "Ишимников", "Ишин", "Ишков", "Иштов", "Ишунин", "Ишутин", "Ищенко", "", "КаЯхтин", "Кабаков", "Кабанец", "Кабанов", "Кабанович", "Кабаньков", "Кабин", "Кабицкий", "Каблуков", "Кавалеров", "Кавелин", "Каверзин", "Каверзнев", "Каверин", "Каверный", "Каврайский", "Каган", "Каганер", "Каганов", "Каганович", "Кагановский", "Каганский", "Каганцев", "Кадашов", "Кадетов", "Кадигроб", "Кадимов", "Кадкин", "Кадников", "Кадомский", "Кадомцев", "Кадочников", "Кадулин", "Кадыгроб", "Кадыков", "Кадыров", "Кадышев", "Каекин", "Каехтин", "Казак", "Казакевич", "Казаков", "Казан", "Казанов", "Казанович", "Казановский", "Казарин", "Казаринов", "Казарский", "Казаченко", "Казачихин", "Казеев", "Казей", "Казимиров", "Казимов", "Казин", "Казначеев", "Казымов", "Казюков", "Каирев", "Каиров", "Кайбышев", "Кайгородов", "Кайгородцев", "Кайдалов", "Кайданов", "Каймаков", "Кайсаров", "Кайтанов", "Какорин", "Какоркин", "Какурин", "Какуркин", "Калабашкин", "Калабин", "Калабухов", "Калакутский", "Калакуцкий", "Калачев", "Калашник", "Калашников", "Калганов", "Каледин", "Каленик", "Калениченко", "Каленков", "Каликин", "Калин", "Калина", "Калиненко", "Калиников", "Калинин", "Калининский", "Калиничев", "Калиниченко", "Калинкин", "Калинков", "Калинников", "Калинов", "Калинович", "Калиновский", "Калинцев", "Калинчев", "Калинчук", "Калинычев", "Калистов", "Калистратов", "Калитин", "Каличенко", "Каличкин", "Калломийцев", "Калманов", "Калмыков", "Каломейцев", "Каломийцев", "Калугин", "Калыничев", "Кальянов", "Калюгин", "Калюжин", "Калюжный", "Калябин", "Калявин", "Калягин", "Каляев", "Калязин", "Калякин", "Камаев", "Камалов", "Каманин", "Камардинов", "Каменский", "Камилавочников", "Каминский", "Камов", "Камович", "Камолов", "Камский", "Камчадалов", "Камчатов", "Камшилов", "Камынин", "Камышев", "Камышин", "Камышников", "Камышов", "Канаев", "Кангисер", "Кандалинцев", "Кандалов", "Кандауров", "Кандеев", "Кандидов", "Кандинский", "Кандреев", "Кандыба", "Кандыбин", "Канев", "Канегисер", "Канищев", "Канский", "Кантемиров", "Кантор", "Канторович", "Кантур", "Канунников", "Канчеев", "Каныгин", "Канюков", "Капанов", "Капацинский", "Капенев", "Капинос", "Капиносов", "Капитонов", "Каплан", "Капланов", "Каплановский", "Каплин", "Капля", "Капралов", "Капранов", "Капуреник", "Капустин", "Капцов", "Капшунов", "Карабанов", "Карабейников", "Карабельщиков", "Караваев", "Каравай", "Караганов", "Карагодин", "Каракозов", "Карамазов", "Карамзин", "Карамышев", "Карандеев", "Карандышев", "Каранов", "Каранович", "Карасев", "Карасик", "Карась", "Карасюк", "Каратаев", "Каратеев", "Каратыгин", "Караулов", "Караульный", "Карачаров", "Карачев", "Карачевский", "Карачеев", "Караченко", "Караченцев", "Карачинский", "Карачурин", "Карбушев", "Карбышев", "Карганов", "Каргаполов", "Каргапольцев", "Каргин", "Каргополов", "Каргопольцев", "Кардаполов", "Кардаш", "Кардашов", "Кардовский", "Кардополов", "Карев", "Кареев", "Карелин", "Карелов", "Карельский", "Карельцев", "Каренгин", "Каренин", "Каретников", "Каржавин", "Каримов", "Каринский", "Кариусенко", "Кариухин", "Кариушкин", "Карканосов", "Карконосов", "Карлов", "Кармацкий", "Карминов", "Кармышев", "Карнаух", "Карнаухов", "Карнаушенко", "Карноносов", "Каронин", "Карпачев", "Карпеев", "Карпека", "Карпекин", "Карпенев", "Карпенко", "Карпенков", "Карпеня", "Карпец", "Карпецкий", "Карпеченко", "Карпиков", "Карпинский", "Карпич", "Карпичев", "Карпишин", "Карпов", "Карпович", "Карповцев", "Карпоносов", "Карпочкин", "Карпук", "Карпун", "Карпуненко", "Карпунин", "Карпуничев", "Карпунищев", "Карпуткин", "Карпухин", "Карпуша", "Карпушев", "Карпушенко", "Карпушенков", "Карпушин", "Карпушкин", "Карпушов", "Карпцев", "Карпычев", "Карпышев", "Карсеев", "Карталов", "Карташев", "Карташевский", "Карташов", "Картмазов", "Карцев", "Карцов", "Карый", "Карышев", "Карякин", "Касанов", "Касаткин", "Касимов", "Касимовский", "Касимцев", "Каспаров", "Касперов", "Касперович", "Кастальский", "Кастанаев", "Кастильский", "Касторский", "Кастров", "Кастулов", "Касумов", "Касымов", "Касьяненко", "Касьянов", "Катаев", "Каталин", "Каталыгин", "Катальников", "Катанов", "Катанский", "Катафьев", "Катенин", "Катеринин", "Катеринич", "Катериночкин", "Катеринюк", "Катечкин", "Катигроб", "Катин", "Катков", "Катонов", "Катревич", "Катренко", "Катрин", "Катрич", "Катунин", "Катунов", "Катунцев", "Катушев", "Катырев", "Катышев", "Катюков", "Катюнин", "Катюшин", "Катюшкин", "Кауров", "Кацарев", "Качалин", "Качалкин", "Качалов", "Качан", "Качанов", "Качаров", "Качинский", "Качмасов", "Качурин", "Качуров", "Кашаев", "Кашеваров", "Кашехлебов", "Кашин", "Кашинцев", "Каширин", "Каширский", "Каширцев", "Кашихин", "Кашицын", "Кашкарев", "Кашкаров", "Кашкин", "Кашпаров", "Кашперко", "Кашперов", "Кашпуров", "Каштанов", "Кашутин", "Кащеев", "Кащенко", "Кащук", "Каюков", "Каюров", "Кваша", "Квашенкин", "Квашенко", "Квашин", "Квашнин", "Кевролятин", "Кедрин", "Кедров", "Келарев", "Келдыш", "Келин", "Кельдерманов", "Кельдишев", "Кельдищев", "Кельдияров", "Кельдышев", "Кельдюшев", "Кельдюшов", "Кельин", "Кельсиев", "Кемарский", "Кенсоринов", "Керенский", "Керенцев", "Кержаков", "Керимов", "Кесарев", "Кибальников", "Кибирев", "Кийко", "Кийков", "Кикиморин", "Кикин", "Киленин", "Киленов", "Киленский", "Килимник", "Киловатов", "Кильдишев", "Кильдюшов", "Киляков", "Киндинов", "Киндяк", "Киндяков", "Кинев", "Кинжалов", "Киняшев", "Кипарисов", "Кипренский", "Кипридин", "Киприянов", "Кирдеев", "Кирдин", "Кирдяев", "Кирдяйкин", "Кирдяпин", "Кирдяшев", "Кирдяшкин", "Киреев", "Киреевский", "Киреенко", "Киренков", "Кириенко", "Кирик", "Кириков", "Кириленко", "Кирилин", "Кирилкин", "Кирилленко", "Кириллин", "Кирилличев", "Кириллов", "Кирилловых", "Кирилов", "Кирилочкин", "Кирилычев", "Кирильцев", "Кирилюк", "Кирин", "Киричев", "Кириченко", "Киричков", "Киркин", "Киров", "Кирсанин", "Кирсанов", "Кирушин", "Кирцов", "Киршанин", "Киршин", "Киршов", "Кирьяков", "Кирьянов", "Кирюкин", "Кирюнин", "Кирюнчев", "Кирютин", "Кирюхин", "Кирюшин", "Кирюшкин", "Киряев", "Кирякин", "Киряков", "Киряковский", "Киселев", "Киселевский", "Кисель", "Кисельников", "Кисленский", "Кислинский", "Кислицин", "Кислицын", "Кислов", "Кисловский", "Кислухин", "Кислых", "Кислюк", "Кисляков", "Кистенев", "Китаев", "Китайгородский", "Китайчик", "Китов", "Кича", "Кичанов", "Кичибеев", "Кичигин", "Кичин", "Кичкин", "Кичугин", "Кичуй", "Кишенков", "Кишенский", "Кишенька", "Кияткин", "Клавдиев", "Клавикордов", "Клебан", "Клебанов", "Клебанский", "Клейменов", "Клейменый", "Клейменых", "Клементьев", "Клеменюк", "Клемин", "Кленин", "Кленов", "Клепалов", "Клепачев", "Клетников", "Клешов", "Клещеногов", "Климанов", "Климанович", "Климачков", "Климашевич", "Климашевский", "Клименко", "Клименков", "Климентов", "Климентьев", "Клименченко", "Клименченок", "Клименюк", "Климин", "Климкин", "Климко", "Климков", "Климкович", "Климов", "Климович", "Климовский", "Климонтович", "Климохин", "Климочкин", "Климук", "Климушев", "Климцев", "Климчак", "Климшин", "Климычев", "Клишанов", "Клишев", "Клишевский", "Клишин", "Клишков", "Клопов", "Клубыков", "Клуников", "Клунников", "Клюев", "Ключарев", "Ключевский", "Ключенков", "Ключинков", "Ключник", "Ключников", "Клюшников", "Клягин", "Клячин", "Клячкин", "Кнорин", "Кнорозов", "Кнуров", "Княгинин", "Княжев", "Княжих", "Княжнин", "Князев", "Кобелев", "Кобзарев", "Кобзев", "Кобзиков", "Кобзин", "Кобзырев", "Кобизев", "Кобозев", "Кобрин", "Кобринцев", "Кобцев", "Кобцов", "Кобызев", "Кобылин", "Кобылкин", "Кобяков", "Ковалев", "Ковалевич", "Ковалевский", "Коваленко", "Коваленков", "Коваленок", "Коваленя", "Ковалик", "Ковалихин", "Ковалишин", "Коваль", "Ковалько", "Ковальков", "Ковальский", "Ковальчук", "Кованько", "Кованьков", "Ковбасюк", "Ковезин", "Ковелин", "Коверзин", "Коверзнев", "Коверин", "Ковешников", "Ковзель", "Коврайский", "Ковтун", "Ковтунов", "Ковшаров", "Ковшов", "Ковырзин", "Ковырин", "Ковырулин", "Коган", "Коганзон", "Коганов", "Коганович", "Кожаев", "Кожанов", "Кожар", "Кожариков", "Кожаров", "Кожарский", "Кожеватов", "Кожевин", "Кожевников", "Кожедуб", "Кожедубов", "Кожеедов", "Кожелупов", "Кожемяка", "Кожемякин", "Кожемяко", "Коженко", "Кожин", "Кожич", "Кожурин", "Кожуров", "Кожухов", "Кожушкин", "Коз", "Коза", "Козадой", "Козак", "Козаков", "Козарез", "Козарин", "Козаринов", "Козарский", "Козачек", "Козаченко", "Коздюк", "Козекеев", "Козел", "Козелин", "Козелихин", "Козелл", "Козелло", "Козелупов", "Козивонов", "Козин", "Козинский", "Козинцев", "Козицын", "Козич", "Козлан", "Козланюк", "Козленок", "Козлинов", "Козлитин", "Козлитинов", "Козлов", "Козлович", "Козловский", "Козловцев", "Козлоков", "Козлюк", "Козляев", "Козляинов", "Козляков", "Козлянинов", "Козлятев", "Козлятин", "Козляткин", "Козлятников", "Козменко", "Кознаков", "Козобородов", "Козодавлев", "Козодаев", "Козодоев", "Козолин", "Козолупов", "Козорез", "Козорезов", "Козориз", "Козулин", "Козырев", "Козыревский", "Козырь", "Козырьков", "Козыряев", "Козьмодемьянский", "Козьяков", "Козюлин", "Койбонов", "Койнов", "Кокин", "Коколев", "Кокора", "Кокорев", "Кокорин", "Кокоринов", "Кокоркин", "Кокотов", "Кокоулин", "Кокошев", "Кокошилов", "Кокошкин", "Кокошников", "Кокуев", "Кокурин", "Кокуркин", "Кокушкин", "Кокшаров", "Кокшаровых", "Колбасин", "Колбаскин", "Колбасьев", "Колбасюк", "Колбоносов", "Колдунов", "Колесник", "Колесников", "Колесниченко", "Колесов", "Колисниченко", "Колмаков", "Колмогоров", "Колмогороцев", "Колмогорцев", "Колмыченко", "Колобов", "Колобродов", "Колов", "Коловратов", "Кологривов", "Колодкин", "Колодников", "Колоколов", "Колокольников", "Коломеец", "Коломенский", "Коломенцев", "Коломиец", "Коломииц", "Коломийцев", "Коломнин", "Коломнитинов", "Коломоец", "Колос", "Колосков", "Колосов", "Колосовников", "Колосовский", "Колосюк", "Колотилов", "Колотов", "Колотовский", "Колотушкин", "Колотый", "Колпаков", "Колпачников", "Колташев", "Колточихин", "Колтунов", "Колтыгин", "Колтыков", "Колтырин", "Колтышев", "Колупаев", "Колчак", "Колченогов", "Колчин", "Колчинский", "Колыванов", "Колыганов", "Колычев", "Кольцов", "Кольчугин", "Колюбакин", "Колюхин", "Колягин", "Коляев", "Коляичев", "Комар", "Комаревский", "Комаров", "Комаровский", "Комбакин", "Комиссаренко", "Комиссаров", "Комков", "Коммунаров", "Коммунист", "Комов", "Комогоров", "Комолов", "Комольцев", "Комухин", "Комшилов", "Комшин", "Комынин", "Комягин", "Комякин", "Конаков", "Конашов", "Конвисар", "Кондаков", "Кондеев", "Кондраков", "Кондрасенко", "Кондратенко", "Кондратенков", "Кондратеня", "Кондратов", "Кондратович", "Кондратьев", "Кондратюк", "Кондрахин", "Кондраценка", "Кондрацкий", "Кондрачук", "Кондрашев", "Кондрашевсий", "Кондрашин", "Кондрашихин", "Кондрашкин", "Кондрашов", "Кондреев", "Кондренко", "Кондричев", "Кондрухов", "Кондручин", "Кондрушкин", "Кондрыченков", "Кондрюков", "Кондушкин", "Кондырев", "Конев", "Коненков", "Конецкий", "Конечный", "Конищев", "Конкин", "Коннов", "Конобеев", "Конов", "Коноваленко", "Коновалихин", "Коновалов", "Коновальцев", "Коновальчук", "Коновницын", "Кононенко", "Кононец", "Кононов", "Кононыкин", "Кононыхин", "Кононюк", "Коноплев", "Коноплин", "Коноплич", "Конопля", "Константинов", "Константиновский", "Концевенко", "Концевой", "Кончанский", "Кончеев", "Кончинов", "Коншин", "Коныгин", "Коныкин", "Конышев", "Конькин", "Коньков", "Коньшин", "Конюхов", "Конюхов", "Конюшенко", "Конюший", "Конюшков", "Конюшок", "Коняев", "Коняхин", "Коняшев", "Коняшин", "Коняшкин", "Копейкин", "Копорский", "Копорушкин", "Копосов", "Коптелов", "Коптилов", "Коптилович", "Коптяев", "Копцов", "Копыл", "Копылов", "Копысов", "Копытин", "Копытов", "Корабельников", "Корабельщиков", "Корганов", "Корельский", "Коренев", "Коренин", "Коренистов", "Коренников", "Корепанов", "Корепин", "Корж", "Коржавин", "Коржаков", "Коржев", "Коржов", "Коржуков", "Корзин", "Корзун", "Корзунов", "Корзухин", "Коридалин", "Корин", "Коринфский", "Корионов", "Корицкий", "Коркмазов", "Коркмасов", "Корконосов", "Кормушев", "Корнаков", "Корнаухов", "Корнашов", "Корнев", "Корнеев", "Корнеевец", "Корнеенко", "Корнейчук", "Корнелюк", "Корниенко", "Корниенков", "Корнийчук", "Корнилин", "Корнилов", "Корнильев", "Корнильцев", "Корнишин", "Корноусов", "Корноухов", "Корнушкин", "Корнышев", "Корнюшин", "Корняков", "Короб", "Коробанов", "Коробейников", "Коробейщиков", "Коробицин", "Коробицын", "Коробкин", "Коробков", "Коробов", "Коробцов", "Коробьин", "Коровенко", "Коровин", "Коровкин", "Коровушкин", "Королев", "Короленко", "Королик", "Король", "Корольков", "Коронин", "Коротаев", "Коротенко", "Коротич", "Короткевич", "Короткий", "Коротких", "Коротков", "Коротовских", "Коротышев", "Корсак", "Корсаков", "Корхов", "Корчагин", "Корчак", "Корчемкин", "Корчмарев", "Коршихин", "Корякин", "Коряковский", "Косамч", "Косарев", "Косекеев", "Косенко", "Косенков", "Косенюк", "Косец", "Косицын", "Космаков", "Косматов", "Космач", "Космачев", "Косминский", "Космодамьянский", "Космодемьянский", "Космынин", "Кособоков", "Кособров", "Косованов", "Косоверов", "Косоглазов", "Косоглядов", "Косоиванов", "Косолапов", "Косолобов", "Косоногов", "Косоплечев", "Косоротов", "Косоруков", "Косоухов", "Костарев", "Костенко", "Костенков", "Костенюк", "Костерев", "Костеренко", "Костерин", "Костиков", "Костин", "Костинюк", "Костогрыз", "Костомаров", "Костоусов", "Кострецов", "Кострикин", "Костриков", "Кострицын", "Костров", "Кострома", "Костромин", "Костромитин", "Костромитинов", "Костромской", "Кострюков", "Костыгин", "Костылев", "Костырев", "Костычев", "Костюк", "Костюкевич", "Костюков", "Костюкович", "Костюнин", "Костюовский", "Костюрин", "Костюченко", "Костюченков", "Костюшин", "Костюшко", "Костяев", "Костяков", "Косулин", "Косульников", "Косыгин", "Косый", "Косых", "Кот", "Котафьев", "Котельников", "Котенин", "Котенко", "Котенков", "Котеночкин", "Котехин", "Котик", "Котин", "Коткин", "Котков", "Котлубеев", "Котлубицкий", "Котляр", "Котляревский", "Котляренко", "Котляров", "Котов", "Котовщиков", "Коточигов", "Котько", "Коханов", "Кохно", "Кохнов", "Кохомский", "Кочанов", "Кочановский", "Кочев", "Кочевин", "Кочемазов", "Кочемаров", "Кочемасов", "Коченевский", "Кочетков", "Кочетов", "Кочин", "Кочкарев", "Кочкин", "Кочмазов", "Кочмарев", "Кочмаров", "Кочнев", "Кочубеев", "Кочубей", "Кошаков", "Кошеваров", "Кошеверов", "Кошелев", "Кошель", "Кошельков", "Кошенин", "Кошенкин", "Кошечкин", "Коширянин", "Кошка", "Кошкарев", "Кошкаров", "Кошкин", "Кошкодавов", "Кошкодаев", "Кошкодамов", "Кошлаков", "Кошурин", "Кошуркин", "Кошурников", "Кошутин", "Кощеев", "Кравец", "Кравцевич", "Кравцов", "Кравченко", "Кравчук", "Крайнев", "Крайнов", "Крайняк", "Кралин", "Крамарев", "Крамаренко", "Крамаров", "Крамник", "Крамов", "Крамской", "Крапивин", "Красавин", "Красавкин", "Красавцев", "Красавчиков", "Красеньков", "Красивов", "Красивый", "Красиков", "Красилов", "Красильников", "Красильщиков", "Красин", "Красичков", "Красневич", "Красненко", "Красненький", "Красников", "Красноармейский", "Краснобаев", "Красноблюев", "Краснобород", "Краснобородкин", "Краснобородов", "Краснобородько", "Краснобояркин", "Краснобрыжев", "Краснов", "Красновидов", "Красноглазов", "Красноглядов", "Красноголовый", "Краснодубский", "Красножен", "Красноженов", "Краснозеев", "Краснозобов", "Краснокутский", "Краснолобов", "Красноложкин", "Красномясов", "Краснонос", "Красноносенко", "Красноносов", "Красноокий", "Краснооков", "Краснопалов", "Краснопевцев", "Краснопеев", "Красноперов", "Краснополин", "Краснополов", "Краснопольский", "Краснопояс", "Краснораменский", "Краснорепов", "Красноруцкий", "Красносивенький", "Краснослепов", "Красноульянов", "Красноумов", "Красноус", "Красноусов", "Красноухов", "Краснофлотский", "Красношеев", "Красноштанов", "Краснощек", "Краснощекий", "Краснощеких", "Краснощеков", "Краснояров", "Краснухин", "Красный", "Красных", "Красняк", "Красов", "Красовский", "Красулин", "Красухин", "Красько", "Красюк", "Красюков", "Кратов", "Крашенинин", "Крашенинников", "Крекшин", "Кремлев", "Кремнев", "Кренев", "Крестинский", "Крестов", "Крестовиков", "Крестовников", "Крестовоздвиженский", "Крестовский", "Кретов", "Кречетников", "Кречетов", "Кречитов", "Криванков", "Кривачев", "Кривенко", "Кривенков", "Кривобоков", "Кривов", "Кривовязов", "Кривоглазов", "Кривозубенко", "Кривозубов", "Кривой", "Кривоколенов", "Кривокорытов", "Криволапов", "Криволуцкий", "Кривоногов", "Кривонос", "Кривоносов", "Кривопалов", "Кривополенов", "Кривопусков", "Криворотов", "Криворотько", "Криворуков", "Криворучко", "Кривоусов", "Кривошапкин", "Кривошеев", "Кривошеин", "Кривошей", "Кривошлыков", "Кривощап", "Кривощапов", "Кривощеков", "Кривулин", "Кривцов", "Кривых", "Кровопусков", "Кромской", "Кропанцев", "Кропачев", "Кропоткин", "Кропотов", "Кропочев", "Крот", "Кротов", "Крохалев", "Кругленин", "Круглецов", "Кругликов", "Круглин", "Круглов", "Круглоликов", "Кругляшов", "Крупеников", "Крупенин", "Крупенников", "Крупецкий", "Крупоедов", "Крупский", "Крутень", "Крутиголова", "Крутиков", "Крутилин", "Крутин", "Крутипорох", "Крутихин", "Крутов", "Крутоголов", "Крутоголовый", "Крутой", "Крутпорох", "Крутых", "Крутько", "Крушельницкий", "Крыгин", "Крыласов", "Крыленко", "Крылов", "Крымов", "Крымский", "Крысанов", "Крюков", "Крючков", "Кряжев", "Кряквин", "Ксандров", "Ксенин", "Ксенофонтов", "Ксюшин", "Ктитарев", "Ктиторов", "Кубарев", "Кубасов", "Кубыш", "Кубышев", "Кубышка", "Кубышкин", "Куваев", "Кувакин", "Кувшиников", "Кувшинников", "Кувыкин", "Кугучин", "Кугушев", "Кудайкулов", "Кудашев", "Кудашов", "Кудаяров", "Кудесников", "Кудеяров", "Кудимов", "Кудин", "Кудинов", "Кудишин", "Кудрашкин", "Кудреватов", "Кудреватый", "Кудрин", "Кудрявцев", "Кудрявчиков", "Кудрявый", "Кудряшов", "Кузекеев", "Куземчиков", "Кузенков", "Кузиков", "Кузин", "Кузичев", "Кузичикин", "Кузищин", "Кузменков", "Кузменок", "Кузмик", "Кузмин", "Кузминчук", "Кузмиченко", "Кузнецов", "Кузнечихин", "Кузоваткин", "Кузовков", "Кузовлев", "Кузовов", "Кузькин", "Кузьменко", "Кузьменков", "Кузьмиков", "Кузьмин", "Кузьминов", "Кузьминский", "Кузьминцев", "Кузьминых", "Кузьмицкий", "Кузьмич", "Кузьмичев", "Кузьмишин", "Кузьмищев", "Кузьмодемьянский", "Кузютин", "Кузякин", "Кузяков", "Кузянин", "Кузярин", "Кузяшин", "Куимов", "Куинджи", "Куйбашев", "Куйбышев", "Кукарин", "Кукин", "Куклев", "Куклин", "Куколев", "Кукольник", "Кукольников", "Кукольщиков", "Кукушкин", "Кукшин", "Кукшинов", "Кулага", "Кулагин", "Кулаев", "Кулаженко", "Кулаженков", "Кулаков", "Кулемин", "Кулемкин", "Кулеш", "Кулешин", "Кулешов", "Кулигин", "Кулижкин", "Кулик", "Куликов", "Куликовский", "Куликовских", "Кулинич", "Кулинченко", "Куличков", "Кулиш", "Кулишов", "Куломзин", "Култыков", "Кулубердиев", "Кульбакин", "Кульманов", "Кульпин", "Куманин", "Кумарев", "Кумбакин", "Кумсков", "Кунаков", "Кунгуров", "Кунгурцев", "Кундурушкин", "Кунжаров", "Кунин", "Куница", "Куницын", "Купавин", "Купидонов", "Купреев", "Купренков", "Купреянов", "Куприенко", "Куприк", "Куприков", "Куприн", "Куприяненко", "Куприянов", "Куприяновский", "Куравлев", "Кураев", "Куракин", "Кураков", "Куранов", "Курапов", "Курасов", "Куратов", "Курашов", "Курбаналеев", "Курбанов", "Курбатов", "Курбский", "Курганов", "Курганский", "Кургляков", "Курдюмов", "Куренков", "Куржаков", "Курзаков", "Куриков", "Курилев", "Куриленко", "Курилин", "Курилкин", "Курилов", "Курильцев", "Курильчиков", "Курин", "Куринов", "Курисов", "Курихин", "Курицын", "Курицына", "Куркин", "Курляев", "Курманалеев", "Курманов", "Курносов", "Куров", "Куроедов", "Куропаткин", "Куроптев", "Курослепов", "Курочкин", "Курсанов", "Курчавов", "Курчатов", "Курчин", "Куршаков", "Куршин", "Курылев", "Курылкин", "Курысев", "Курышев", "Курышкин", "Курьянов", "Курятин", "Кусекеев", "Кустодиев", "Кутайсов", "Кутахов", "Кутейников", "Кутейщиков", "Кутепов", "Куткин", "Кутлуков", "Куттыев", "Кутузов", "Кутыев", "Кутырев", "Кутырин", "Кутыркин", "Куфтин", "Кухарев", "Кухаренко", "Кухмистеров", "Кухолев", "Кухтенков", "Кухтин", "Куценогий", "Куцопало", "Кучер", "Кучеренко", "Кучеров", "Кучин", "Кучкин", "Кучков", "Кучма", "Кучменко", "Кучмин", "Кучук", "Кучуков", "Кучуров", "Кушвид", "Кушелев", "Кушнарев", "Кушнер", "Кушнерев", "Кушнир", "Кушнирев", "Кушниренко", "Куяков", "", "Лабзин", "Лабудин", "Лабунин", "Лабутин", "Лабуткин", "Лаверко", "Лаверычев", "Лавников", "Лавочников", "Лавренев", "Лавренко", "Лавренов", "Лавренович", "Лаврентьев", "Лавренцев", "Лавренчук", "Лавренюк", "Лаврец", "Лаврив", "Лаврик", "Лавриков", "Лавримов", "Лаврин", "Лавриненко", "Лавриненков", "Лавринец", "Лавринов", "Лавринович", "Лавринцев", "Лавриченко", "Лаврищев", "Лаврищенко", "Лавров", "Лаврович", "Лавровский", "Лавронов", "Лаврук", "Лаврухин", "Лаврушин", "Лаврушко", "Лаврущенко", "Лагарпов", "Лагерев", "Лаговский", "Лаговской", "Лагодин", "Лагошин", "Лагунов", "Лагунцов", "Лагута", "Лагутенко", "Лагутенок", "Лагутин", "Лагуткин", "Лагутчев", "Ладейщиков", "Ладыгин", "Ладыженский", "Ладыжинский", "Ладыжников", "Ладынин", "Лажечников", "Лазарев", "Лазаревич", "Лазаренко", "Лазаренков", "Лазариди", "Лазаричев", "Лазарко", "Лазарчук", "Лазебников", "Лазлов", "Лазоренко", "Лазукин", "Лазунин", "Лазурин", "Лазутин", "Лазуткин", "Лазутчиков", "Лазухин", "Лайкин", "Лайков", "Лакашев", "Лакашин", "Лакедемонский", "Лактин", "Лактионов", "Лактюшин", "Лактюшкин", "Лакшин", "Лалетин", "Лалитин", "Ламакин", "Ламанов", "Ламзин", "Ламский", "Ланбин", "Ландышев", "Ланин", "Ланкин", "Лановой", "Ланских", "Лансков", "Ланской", "Ланщиков", "Лапатин", "Лапикин", "Лапин", "Лапкин", "Лапко", "Лапочкин", "Лаптев", "Лаптенков", "Лапухин", "Лапшин", "Лапшинов", "Лапшов", "Лапыгин", "Ларгин", "Лариков", "Ларин", "Ларинцев", "Ларион", "Ларионов", "Лариохин", "Лариошин", "Лариошкин", "Ларихин", "Ларичев", "Ларичкин", "Ларищев", "Ларцев", "Ларченко", "Ларчин", "Ларькин", "Ларьков", "Ларюхин", "Ларюшин", "Ларюшкин", "Ласковенков", "Латин", "Латынин", "Латыш", "Латышев", "Лаушкин", "Лахтанов", "Лахтин", "Лахтионов", "Лачев", "Лачин", "Лачинов", "Лачков", "Лашкарев", "Лашкевич", "Лашкин", "Лашко", "Лашманов", "Лашунин", "Лащилин", "Лбов", "Лебедев", "Лебедевич", "Лебеденко", "Лебеденков", "Лебедецкий", "Лебедин", "Лебединец", "Лебединов", "Лебединский", "Лебединцев", "Лебедка", "Лебедкин", "Лебеднов", "Лебедь", "Лебедько", "Лебедянский", "Лебедянцев", "Лебеженинов", "Лев", "Лева", "Левада", "Левай", "Леванидов", "Леванов", "Леванович", "Левашкевич", "Левашов", "Левенко", "Левенцев", "Левенцов", "Левин", "Левинский", "Левитов", "Левицкий", "Левичев", "Левищев", "Левкеев", "Левкин", "Левко", "Левков", "Левковец", "Левкович", "Левковский", "Левкоев", "Левонов", "Левонтин", "Левонтьев", "Левочкин", "Левочко", "Левошин", "Левский", "Левухин", "Левушкин", "Левцов", "Левчаков", "Левченко", "Левченков", "Левчишин", "Левчук", "Левчуков", "Левша", "Левшанов", "Левшин", "Левшуков", "Левыкин", "Левышев", "Легасов", "Легашов", "Легенький", "Легкий", "Легких", "Легонький", "Легостаев", "Легчилин", "Леденев", "Ледин", "Леднев", "Ледяев", "Ледяйкин", "Ледянкин", "Лежнев", "Лезгунов", "Лезжов", "Лезин", "Лейкин", "Лекарев", "Лекаркин", "Лекасов", "Лексаков", "Лексик", "Лексиков", "Лексин", "Леликов", "Лелькин", "Лельков", "Лелюхин", "Лелянов", "Леляшин", "Лемаренко", "Лемехов", "Лемешев", "Лемяхов", "Ленев", "Ленивцев", "Ленин", "Ленкин", "Ленков", "Ленковский", "Ленников", "Ленов", "Лентов", "Лентовский", "Лентулов", "Лентьев", "Ленцов", "Ленченко", "Ленчик", "Леншин", "Ленько", "Леньков", "Леньшин", "Леон", "Леонардов", "Леоненко", "Леонидов", "Леоничев", "Леонов", "Леонович", "Леонтенков", "Леонтиев", "Леонтович", "Леонтьев", "Леонтьевский", "Леончев", "Леончик", "Леонычев", "Леоньков", "Лепахин", "Лепашин", "Лепетов", "Лепетухин", "Лепехин", "Лепехов", "Лепешкевич", "Лепешкин", "Лепешков", "Лепешов", "Лепилин", "Лепилов", "Лепин", "Лепихин", "Лепов", "Лепорский", "Лепский", "Лермонтов", "Лесанов", "Лесик", "Лесин", "Лескин", "Лесков", "Лесковский", "Лесников", "Лесниченко", "Леснов", "Лесновский", "Лесной", "Лесных", "Лесов", "Лесовой", "Лесовский", "Лесовщиков", "Лестев", "Лесунов", "Лесько", "Летавин", "Летаев", "Летенин", "Летенков", "Летецкий", "Летин", "Летичевский", "Летковский", "Летнев", "Летов", "Летовальцев", "Летугин", "Летунов", "Летуновский", "Летучев", "Летючий", "Летягин", "Леуков", "Леушев", "Леушин", "Леушкин", "Леханов", "Лехин", "Лешаков", "Лешенков", "Лешин", "Лешкин", "Лешков", "Лешонков", "Лешуков", "Лешунов", "Лешутов", "Лещаков", "Лещев", "Лещенко", "Лещенков", "Лещинский", "Лещов", "Лещук", "Либанов", "Либашкин", "Либин", "Либкин", "Либов", "Ливанов", "Ливенцев", "Ливенцов", "Ливцев", "Лидяев", "Лизогуб", "Лизогубенко", "Лизогубов", "Лизунков", "Лизунов", "Лизько", "Ликин", "Ликунов", "Лилеев", "Лилин", "Лимарев", "Лимаренко", "Лимаренков", "Лимарь", "Лимнев", "Лимоник", "Лимонников", "Лимонов", "Лимонченко", "Лимончик", "Лимончиков", "Лиморенко", "Линев", "Линевич", "Линиченко", "Линкевич", "Линков", "Линник", "Линников", "Линтварев", "Линьков", "Линяев", "Лиодоров", "Лион", "Липаев", "Липаткин", "Липатов", "Липатьев", "Липецкий", "Липилин", "Липин", "Липинский", "Липихин", "Липка", "Липко", "Липовенко", "Липовцев", "Липовый", "Липский", "Липченков", "Липчук", "Лирин", "Лиров", "Лис", "Лисаев", "Лисай", "Лисаков", "Лисаковский", "Лисанов", "Лисенин", "Лисенко", "Лисенков", "Лисенчук", "Лисин", "Лисицын", "Лисичкин", "Лисниченко", "Лисничук", "Лисняк", "Лисняков", "Лисов", "Лисовенко", "Лисовец", "Лисовицкий", "Лисовой", "Лисовский", "Лисой", "Листков", "Листов", "Листочкин", "Листратов", "Листьев", "Лисый", "Лисых", "Лисыцин", "Лисюк", "Лисютин", "Лисяков", "Литвак", "Литвин", "Литвиненко", "Литвиненок", "Литвинец", "Литвинов", "Литвинович", "Литвинонко", "Литвинский", "Литвинцев", "Литвинчев", "Литвинчук", "Литвинюк", "Литвишков", "Литвяк", "Литвяков", "Литов", "Литовка", "Литовкин", "Литовко", "Литовский", "Литовцев", "Литовченко", "Литунов", "Литягин", "Лифанов", "Лифановский", "Лифантьев", "Лифарев", "Лифенко", "Лиханин", "Лиханов", "Лихарев", "Лихарь", "Лихачев", "Лихачевых", "Лихванчук", "Лихин", "Лихненко", "Лихобабин", "Лихов", "Лиховидов", "Лиховол", "Лиходед", "Лиходедов", "Лиходеев", "Лихой", "Лихолет", "Лихоманов", "Лихонин", "Лихоносов", "Лихотников", "Лихоузов", "Лихохвостов", "Лихошерстов", "Лихутин", "Лихушин", "Лицов", "Лицын", "Личинин", "Личутин", "Лишин", "Лобан", "Лобанов", "Лобановский", "Лобанок", "Лобарев", "Лобасев", "Лобастов", "Лобахин", "Лобацевич", "Лобач", "Лобачев", "Лобачевский", "Лобаченко", "Лобачов", "Лобашев", "Лобашков", "Лобашов", "Лобинов", "Лобичев", "Лобкарев", "Лобко", "Лобков", "Лобнев", "Лобов", "Лобовко", "Лобок", "Лобочкин", "Лобченко", "Лобыкин", "Лобынцев", "Ловачев", "Ловейко", "Ловецкий", "Ловкий", "Ловлев", "Ловляга", "Ловтаков", "Ловушкин", "Ловцов", "Ловчев", "Ловчик", "Ловчиков", "Ловчинов", "Ловчинский", "Ловышев", "Ловягин", "Логанов", "Логанович", "Логачев", "Логашев", "Логашов", "Логвин", "Логвиненко", "Логвиничев", "Логвинов", "Логгинов", "Логин", "Логинов", "Логиновский", "Логиновских", "Логовой", "Логунов", "Логутенко", "Логутин", "Логутов", "Лодейников", "Лодейщиков", "Лодкин", "Лодочкин", "Лодочников", "Лодыгин", "Лодыжников", "Лодынин", "Лодышкин", "Лоев", "Ложекин", "Ложечкин", "Ложечников", "Ложкин", "Ложников", "Лоза", "Лозбинев", "Лозиков", "Лозин", "Лозинский", "Лозовенко", "Лозовицкий", "Лозовой", "Лозовский", "Лозян", "Локотков", "Локотников", "Локсеев", "Локтанов", "Локтев", "Локтионов", "Локтистов", "Локшин", "Ломагин", "Ломаев", "Ломакин", "Ломако", "Ломанко", "Ломанов", "Ломаносов", "Ломацкий", "Ломаченков", "Ломаш", "Ломин", "Ломков", "Ломлюкин", "Ломов", "Ломовский", "Ломовцев", "Ломонос", "Ломоносов", "Лонгвинов", "Лонгинов", "Лопаев", "Лопарев", "Лопаревич", "Лопата", "Лопатин", "Лопатинский", "Лопатка", "Лопаткин", "Лопатко", "Лопатышкин", "Лопатьев", "Лопатюк", "Лопов", "Лопухин", "Лопухов", "Лопушанский", "Лопушенко", "Лопырев", "Лопышев", "Лорин", "Лосев", "Лосевич", "Лосенков", "Лосиков", "Лось", "Лосюк", "Лотвин", "Лотов", "Лоторов", "Лотынин", "Лотырев", "Лофицкий", "Лохтин", "Лоцман", "Лоцманов", "Лошадкин", "Лошкарев", "Лошкаров", "Лошкомоев", "Лощилин", "Лубенцов", "Лубянников", "Лугвенев", "Луговой", "Луговский", "Луговской", "Луговцев", "Лужецкий", "Лужин", "Лужков", "Лузан", "Лузанов", "Лузгин", "Лузянин", "Лука", "Луканин", "Лукачев", "Лукаш", "Лукашев", "Лукашевич", "Лукашенко", "Лукашин", "Лукашкин", "Лукашов", "Лукашонок", "Лукашук", "Лукащук", "Лукин", "Лукинов", "Лукинский", "Лукиных", "Лукичев", "Лукиянчук", "Луков", "Лукович", "Луковкин", "Луковников", "Луковский", "Луконин", "Лукоянов", "Лукутин", "Лукшин", "Лукьненко", "Лукьянец", "Лукьянов", "Лукьянцев", "Лукьянченко", "Лукьянчиков", "Лукьянчук", "Луначарский", "Лунев", "Лунин", "Луничкин", "Лунченков", "Лунькин", "Луньков", "Лупаков", "Лупаленко", "Лупандин", "Лупанин", "Лупанов", "Лупачев", "Лупашко", "Лупибереза", "Лупинос", "Лупирыба", "Лупичев", "Лупкин", "Лупов", "Луппов", "Лутовин", "Лутовинов", "Лутонин", "Лутохин", "Лутошин", "Лутошкин", "Лутошников", "Лутьянов", "Луферов", "Лухманов", "Луховитин", "Лучевников", "Лученинов", "Лучин", "Лучинин", "Лучкай", "Лучкин", "Лучников", "Лушин", "Лыдкин", "Лызлов", "Лыков", "Лыкошин", "Лымаренко", "Лымарь", "Лындин", "Лындяев", "Лысаев", "Лысак", "Лысанов", "Лысенко", "Лысенков", "Лысиков", "Лысин", "Лысков", "Лысковец", "Лысоконь", "Лысяк", "Лысяков", "Лытаев", "Лыткин", "Львин", "Львов", "Львович", "Львовский", "Любавин", "Любавский", "Любавцев", "Любанин", "Любарский", "Любахин", "Любашевский", "Любашин", "Любвин", "Любезный", "Любиев", "Любимов", "Любимцев", "Любимый", "Любин", "Любищев", "Любкин", "Любовин", "Любовников", "Любовцев", "Любочкин", "Любусин", "Любутин", "Любухин", "Любушин", "Любушкин", "Любченко", "Любчик", "Любятин", "Любятинский", "Люкшин", "Люминарский", "Люсин", "Лютиков", "Лютихин", "Лютов", "Лютягин", "Люшин", "Лягин", "Ляднов", "Лядов", "Лякин", "Ляков", "Лялечкин", "Лялин", "Лялькин", "Лямин", "Лямудин", "Лямцев", "Лямцын", "Ляпидевский", "Ляпин", "Ляпичев", "Ляпунов", "Ляуданский", "Лях", "Ляхов", "Ляховец", "Ляхович", "Ляшко", "", "Маврин", "Мавринский", "Мавришин", "Мавров", "Мавроди", "Мавродиев", "Мавродий", "Мавродин", "Мавропуло", "Маврыкин", "Маврычев", "Магазинов", "Магазинщиков", "Магаков", "Магамедагаев", "Магамедов", "Маганин", "Маганов", "Магаюров", "Магдалинский", "Магеркин", "Магеров", "Магеря", "Магидов", "Магильницкий", "Магин", "Магичев", "Магнитский", "Магницкий", "Магнюхин", "Магомедбеков", "Магомедов", "Магомедрасулов", "Магоня", "Магура", "Магуренко", "Магутов", "Мадаев", "Мадьяров", "Мадьяров(1)", "Мадьяров(2)", "Маев", "Маевич", "Маеров", "Мажарин", "Мажаров", "Мажжухин", "Мазаев", "Мазалов", "Мазаник", "Мазанков", "Мазанов", "Мазаньков", "Мазеин", "Мазепа", "Мазий", "Мазикин", "Мазиков", "Мазилкин", "Мазилов", "Мазин", "Мазинов", "Мазихин", "Мазицын", "Мазко", "Мазлов", "Мазнев", "Мазнин", "Мазняк", "Мазовецкий", "Мазунин", "Мазур", "Мазурев", "Мазуренко", "Мазурин", "Мазуркевич", "Мазуров", "Мазуровский", "Мазурок", "Мазурук", "Мазуряк", "Мазухин", "Мазыра", "Мазырин", "Мазякин", "Майданенко", "Майданкин", "Майданников", "Майданов", "Майданский", "Майданюк", "Майкин", "Майко", "Майков", "Майнаков", "Майноленко", "Майнуйленко", "Майнуйло", "Майнулов", "Майор", "Майоров", "Майоровский", "Майорский", "Майровский", "Майтаков", "Макавеев", "Макавейский", "Макагон", "Макагоненко", "Макагонов", "Макаев", "Маканьковский", "Макар", "Макарев", "Макаревич", "Макаревский", "Макареев", "Макаренко", "Макаренков", "Макаренцев", "Макарин", "Макаринцев", "Макарихин", "Макаричев", "Макаришин", "Макаркин", "Макаров", "Макаровский", "Макаронов", "Макарочкин", "Макарский", "Макаруха", "Макарушка", "Макарушкин", "Макарцев", "Макарченков", "Макарчик", "Макарчук", "Макаршин", "Макарычев", "Макарь", "Макарьев", "Макарьянц", "Макашев", "Макашин", "Макашиов", "Макашов", "Македонский", "Макеев", "Макеенко", "Макеенков", "Макеин", "Макейкин", "Макидонов", "Макиев", "Макин", "Маккавеев", "Макковеев", "Маклак", "Маклаков", "Маклашев", "Маклашин", "Маклюк", "Маклюков", "Макляк", "Маковеев", "Маковей", "Маковецкий", "Маковский", "Маковчук", "Макогогненко", "Макогон", "Макогоненко", "Макогонов", "Макоедов", "Макокин", "Маконин", "Макошин", "Макридин", "Макроусов", "Макрушин", "Максаев", "Максаков", "Максаковский", "Максарев", "Максаров", "Максеев", "Максемьюк", "Максименко", "Максименок", "Максимец", "Максимишин", "Максимов", "Максимович", "Максимовский", "Максимонько", "Максимук", "Максимушкин", "Максимчук", "Максимычев", "Максимюк", "Максимят", "Максин", "Максудов", "Максутов", "Максютенко", "Максютин", "Максютов", "Максюша", "Максюшин", "Максятин", "Максяткин", "Максячкин", "Макунин", "Макурин", "Макух", "Макухин", "Макушев", "Макушин", "Макушкин", "Макцев", "Макшанцев", "Макшеев", "Малаев", "Малай", "Малакин", "Малаков", "Малакшин", "Маланичев", "Маланкин", "Маланов", "Маланчик", "Маланьин", "Малафеев", "Малафеевский", "Малахин", "Малахинов", "Малахов", "Малаховцев", "Малашев", "Малашенко", "Малашин", "Малашинский", "Малашкин", "Малашков", "Малеванный", "Малеванов", "Малевинский", "Малевич", "Малевч", "Малеев", "Малеин", "Малеинин", "Малеинов", "Малена", "Маленин", "Маленкин", "Маленков", "Маленький", "Маленьких", "Маленько", "Малец", "Малечкин", "Малиев", "Малик", "Малин", "Малинин", "Малинкин", "Малинников", "Малинов", "Малинович", "Малиновский", "Малиночка", "Маличко", "Малкин", "Малков", "Малов", "Маловатый", "Малоголовка", "Малоземов", "Малоиванов", "Малой", "Малолетков", "Малолетнев", "Маломыжев", "Малоносов", "Малороссиянов", "Малоротов", "Малоушкин", "Малофеев", "Малофейкин", "Малухин", "Малуша", "Малушин", "Малыванов", "Малыга", "Малыгин", "Малыгов", "Малый", "Малыкин", "Малыков", "Малынко", "Малытин", "Малых", "Малыхин", "Малыш", "Малышев", "Малышевский", "Малышенко", "Малышкин", "Малышко", "Мальгин", "Малькевич", "Малько", "Мальковский", "Мальнев", "Мальханов", "Мальцев", "Мальцевич", "Мальцов", "Мальченко", "Мальченков", "Мальчиков", "Мальчугов", "Малюга", "Малюгин", "Малюгов", "Малюк", "Малюкин", "Малюков", "Малюнин", "Малюсов", "Малюта", "Малютин", "Малюткин", "Малюхов", "Малюченко", "Малюшин", "Малявин", "Малявкин", "Малявко", "Малягин", "Маляев", "Малякин", "Маляков", "Малянов", "Маляр", "Маляревский", "Маляренко", "Маляров", "Малятин", "Маляшев", "Мамадилов", "Мамаев", "Мамай", "Мамантов", "Маматов", "Мамашев", "Мамедбеков", "Мамедгасанов", "Мамедияров", "Мамедов", "Маметов", "Мамин", "Мамичев", "Мамкин", "Мамлеев", "Мамлин", "Мамонин", "Мамонов", "Мамонт", "Мамонтов", "Мамотов", "Мамошин", "Мамошкин", "Мамулат", "Мамурин", "Мамушкин", "Мамченко", "Мамченков", "Мамчиц", "Мамчук", "Мамыкин", "Манаев", "Манаенков", "Манайло", "Манакин", "Манаков", "Манаковский", "Мананков", "Мананников", "Манастрев", "Манастрыный", "Манастырный", "Манастырский", "Манахов", "Мангазеин", "Мангезеев", "Манджиев", "Мандравин", "Мандриков", "Мандрин", "Мандругин", "Мандрыгин", "Мандрык", "Мандрыкин", "Манеркин", "Манеров", "Манжурцев", "Манзуров", "Манилов", "Манин", "Манихин", "Манишин", "Манишкин", "Манкевич", "Манковский", "Манкошев", "Маннаников", "Манойленко", "Манойлов", "Манохин", "Маношин", "Мансуров", "Мантров", "Мантуров", "Мануилов", "Мануйленко", "Мануйло", "Мануйлов", "Мануков", "Манулкин", "Мануха", "Манухин", "Манухов", "Манушев", "Манушин", "Манушкин", "Манчев", "Манченко", "Маншин", "Маныкин", "Манылин", "Манылов", "Манькин", "Манько", "Маньков", "Манюкин", "Манюков", "Манюнин", "Манюрин", "Манюшко", "Манякин", "Маняхин", "Маняшин", "Мараев", "Мараков", "Маракулин", "Маракуша", "Маракушев", "Маракшин", "Маралов", "Марамыгин", "Марамырин", "Маранин", "Марасакин", "Маргаритов", "Марголин", "Марданов", "Мардарь", "Мардасов", "Мардашев", "Марев", "Мареев", "Мареичев", "Маренин", "Маренко", "Маренков", "Маренюк", "Маресев", "Маресьев", "Марецкий", "Маржеретта", "Мариев", "Марикин", "Мариков", "Марилов", "Марин", "Мариневич", "Мариненко", "Маринеску", "Маринец", "Мариниенко", "Маринин", "Маринич", "Мариничев", "Маринкин", "Маринов", "Маринцев", "Маринченко", "Маринчук", "Мариняк", "Марисин", "Марисов", "Марич", "Маришин", "Мариюшкин", "Маркачев", "Маркевич", "Маркеев", "Маркелкин", "Маркелов", "Маркехин", "Маркешин", "Маркив", "Маркин", "Марков", "Марковников", "Марковский", "Марковских", "Маркосов", "Маркуль", "Маркунин", "Маркухин", "Маркуц", "Маркуша", "Маркушкин", "Маркцев", "Мармазинский", "Маров", "Мартемьянов", "Мартин", "Мартинин", "Мартинович", "Мартишин", "Мартусов", "Мартушев", "Мартыненко", "Мартынихин", "Мартынкин", "Мартынов", "Мартынчев", "Мартынченко", "Мартынчик", "Мартынюк", "Мартысюк", "Мартыч", "Мартышев", "Мартышкин", "Мартышков", "Мартьянов", "Мартьянычев", "Мартюгин", "Мартюнин", "Мартючков", "Мартюшев", "Мартюшин", "Мартюшов", "Мартяничев", "Марунин", "Марусев", "Марусин", "Марусич", "Марусов", "Марухин", "Марушин", "Марушка", "Марушкевич", "Марущак", "Марущенко", "Марфенин", "Марфенькин", "Марфин", "Марфицын", "Марфич", "Марфичев", "Марфунин", "Марфутенко", "Марфутин", "Марфухин", "Марфушин", "Марцев", "Марченков", "Марчик", "Марчук", "Маршак", "Маршаков", "Маршев", "Марынчук", "Марычев", "Марышев", "Марьевский", "Марьенков", "Марьин", "Марьюшкин", "Марьямов", "Марьянов", "Марьяшкин", "Марюшин", "Марягин", "Марясин", "Марясов", "Маряхин", "Маряшин", "Масалитинов", "Маслаков", "Маслеников", "Масленников", "Масленцов", "Маслов", "Масловский", "Масляк", "Масляков", "Мастерков", "Матвеев", "Машенькин", "Машин", "Машинов", "Машихин", "Машкин", "Машутин", "Машуткин", "Медвенцев", "Медоварцев", "Медовников", "Медовой", "Медовщиков", "Медунов", "Медуха", "Медынский", "Медынцев", "Медяков", "Медяник", "Межаков", "Межин", "Мезенов", "Мезенцев", "Меланчук", "Меланьин", "Мелащенко", "Мелекесцев", "Меленкин", "Мелетиев", "Мелетин", "Мелетинский", "Мелехин", "Мелехов", "Мелешин", "Мелешко", "Мелещенко", "Мелихов", "Мелузкин", "Мелузов", "Мельгунов", "Мельник", "Мельниченко", "Мельничок", "Мельшин", "Мелюзгин", "Мелюзов", "Мелюхин", "Меньщиков", "Меремьянов", "Меретьев", "Мерецков", "Мерзляченцев", "Меркешин", "Меркин", "Меркулов", "Меркуров", "Меркухин", "Меркушев", "Меркушин", "Металлов", "Метелев", "Метелкин", "Метелов", "Метленко", "Метлин", "Метлушко", "Метт", "Мехоношин", "Мехряков", "Мечников", "Мещанинов", "Мещерин", "Мещеринов", "Мещеров", "Мещерский", "Мещеряков", "Мигачев", "Мигулин", "Мигуля", "Мигунов", "Мижурин", "Мизгирев", "Мизинов", "Микешин", "Микитенко", "Микитин", "Микифоров", "Микичук", "Миклашевский", "Миклашков", "Миклухо", "Микулин", "Микулич", "Микульский", "Милеев", "Миленин", "Милехин", "Милко", "Милов", "Милованов", "Миловидов", "Миловский", "Милосердов", "Милославский", "Мильков", "Мильтонов", "Мильчаков", "Милютин", "Миляев", "Минаев", "Минакин", "Минасов", "Миначенко", "Минашкин", "МингалЯв", "Миневрин", "Минеев", "Минин", "Мирошников", "Мирошниченко", "Митрофанов", "Митрохин", "Михайлов", "Михайлушкин", "Михненко", "Мичурин", "Мйнаков", "Мйнулов", "Ммокичев", "МнЯв", "Могила", "Могилат", "Могилев", "Могилевский", "Могилевцев", "Могилевчик", "Могилин", "Могильников", "Могильный", "Могутин", "Могутнов", "Могутов", "Модеев", "Моденов", "Модестов", "Можаев", "Можаитин", "Можаитинов", "Можайский", "Можаров", "Можевитинов", "Мозговой", "Мозжевитинов", "Мозжорин", "Мозжухин", "Мозолькин", "Мозолюк", "Моисеев", "Моисеенко", "Моисеенков", "Мойсеев", "Мойсеенко", "Мокашев", "Мокашин", "Мокашов", "Мокеев", "Мокеенко", "Мокеичев", "Мокешин", "Мокиевич", "Мокиевский", "Мокин", "Мокичев", "Моклаков", "Моклашев", "Моклашин", "Мокрецов", "Мокрий", "Мокрицкий", "Мокров", "Мокроносов", "Мокротоваров", "Мокроусов", "Мокрушин", "Мокряков", "Мокшанцев", "Мокшин", "Молдованов", "Молоканов", "Молоков", "Молоснов", "Молостнов", "Молостов", "Молочков", "Молочников", "Молошников", "Молошный", "Молчанов", "Момотов", "Монастырев", "Монастырский", "Монахин", "Монахов", "Моникин", "Монин", "Монов", "Монюкин", "Монюков", "Моргун", "Моргунов", "Мордасов", "Мордачев", "Мордашов", "Мордвин", "Мордвиненко", "Мордвинкин", "Мордвинов", "Мордвинцев", "Мордин", "Мордкин", "Мордкович", "Мордов", "Мордовин", "Мордовкин", "Мордовский", "Мордовской", "Мордовцев", "Мордюков", "Мордяшов", "Моржеедов", "Моржеретов", "Мороз", "Морозкин", "Морозов", "Мороков", "Морткин", "Мосальский", "Мосеев", "Мосеичев", "Мосейчук", "Мосин", "Мосичев", "Москалев", "Москаленко", "Москалик", "Москаль", "Москалюк", "Москвин", "Москвитин", "Москвитинов", "Москвитянов", "Москвичев", "Москвишин", "Москвский", "Московкин", "Московсков", "Московцев", "Мосолов", "Мостовой", "Мостовский", "Мосягин", "Мосякин", "Мосяков", "Мотнов", "Мотной", "Мотовилов", "Мотовкин", "Моторин", "Мотуренко", "Моховиков", "Мочалов", "Мочульский", "Мошкин", "Мошков", "Мржеретов", "Мстиславский", "Мужевитинов", "Мукаев", "Муканов", "Мукосеев", "Мулин", "Мултановский", "Муляров", "Муравлев", "Муравцев", "Муравьев", "Мурагин", "Муратов", "Муратышев", "Мурашев", "Мурашкин", "Мурашкинцев", "Мурашко", "Мурашов", "Мурзин", "Мурзич", "Мурин", "Мусаков", "Мусатов", "Мусиенко", "Мусин", "Мусихин", "Мусоргский", "Мустафин", "Мутылин", "Муха", "Муханов", "Мухин", "Мухортиков", "Мухортов", "Мухортых", "Мухтаров", "Мучников", "Мушкет", "Мушкетов", "Мушников", "Муштаков", "Мызников", "Мыльников", "Мымликов", "Мымрин", "Мынкин", "Мысин", "Мыскин", "Мысков", "Мыцыков", "Мышак", "Мышкин", "Мышковский", "Мышонков", "Мягкий", "Мягков", "Мякишев", "Мямлин", "Мясищев", "Мясоедов", "Мятлев", "Мятлин", "Мячин", "Мячков", "", "", "", "Набатов", "Набережный", "Набережных", "Набиев", "Набойщиков", "Набока", "Набокин", "Набоков", "Навагин", "Наваксин", "Навалихин", "Наволоцкий", "Наврозов", "Навроцкий", "Наврузов", "Наврузян", "Нагаев", "Нагайцев", "Нагибин", "Нагирный", "Нагих", "Нагишкин", "Нагнибеда", "Наговицын", "Нагой", "Нагорнов", "Нагорный", "Нагорных", "Нагорский", "Наградов", "Нагульнов", "Нагурский", "Надеждин", "Надеждинский", "Надежин", "Надежкин", "Надеин", "Надпорожский", "Надрагин", "Надъярный", "Надъярных", "Назар", "Назаренко", "Назаренков", "Назаретский", "Назарков", "Назаров", "Назарцев", "Назарчук", "Назарьев", "Назарьевых", "Названов", "Назимов", "Найденов", "Найденышев", "Накваса", "Наквасин", "Наконечный", "Налетов", "Наливкин", "Налимов", "Намазов", "Наметкин", "Напалкин", "Напалков", "Наполеонов", "Направник", "Напьерский", "Нардов", "Наркисcов", "Наркисов", "Наркиссов", "Нармаев", "Нармацкий", "Наровчатов", "Нароков", "Нартов", "Нарцисов", "Нарциссов", "Нарцызов", "Нарышкин", "Наседкин", "Насекин", "Наследников", "Наследышев", "Наслузов", "Насонов", "Насрулаев", "Насруллаев", "Настасьев", "Настасьин", "Настин", "Настоящий", "Настюков", "Насунов", "Насыров", "Натальин", "Наталья", "Натахин", "Наташин", "Наточеев", "Наточиев", "Наугольнов", "Наугольный", "Наугольных", "Науменко", "Науменков", "Наумкин", "Наумов", "Наумченко", "Наумчик", "Наумшин", "Наумычев", "Нафтали", "Нафталин", "Нафтульев", "Нахабин", "Нахимов", "Нахимович", "Нахимовский", "Нахимсон", "Нащокин", "НеЯлов", "Неаполитанов", "Неаполитанский", "Небаев", "Небогатов", "Небогатый", "Неболсин", "Небольсин", "Неборсин", "Небосклонов", "Невдахин", "Невежин", "Невельский", "Невельской", "Невенченый", "Неверов", "Неверовский", "Невечера", "Невзоров", "Невзрачев", "Невзрачеев", "Неводчиков(1)", "Неводчиков(2)", "Невоструев", "Неврев", "Невров", "Неврюев", "Невский", "Невструев", "Невтерпов", "Невтонов", "Невьянцев", "Негодяев", "Недачин", "Недбаев", "Неделин", "Неделков", "Неделькин", "Недобитов", "Недобоев", "Недобров", "Недовесков", "Недовесов", "Недогадов", "Недоглядов", "Недогонов", "Недодаев", "Недожогин", "Недожоров", "Недозевин", "Недозрелов", "Недоквасов", "Недокладов", "Недокукин", "Недокучаев", "Недомеров", "Недомолвин", "Недоносков", "Недопекин", "Недоплясов", "Недопузин", "Недорезов", "Недоростков", "Недорубаев", "Недорубов", "Недосеев", "Недосейкин", "Недосекин", "Недосказов", "Недоспасов", "Недостоев", "Недоступкин", "Недотыкин", "Недохлебов", "Недочетов", "Недошибин", "Недошивин", "Недригайло", "Недригайлов", "Недуванов", "Неелов", "Неешхлеба", "Нежданов", "Нежнипапа", "Незамаев", "Незванов", "Незговоров", "Нездольев", "Нездольцев", "Незлобин", "Незнакомов", "Незнамов", "Незнанов", "Незовибатько", "Незус", "Неизвестный", "Некифоров", "Неклюдов", "Некрасов", "Нелединский", "Нелидов", "Нелюбимов", "Нелюбин", "Нелюбов", "Немакин", "Неманов", "Немвродов", "Немечик", "Немешаев", "Немилов", "Немиров", "Немкин", "Немков", "Немоляев", "Немушкин", "Немцев", "Немцов", "Немченко", "Немченков", "Немчинин", "Немчинов", "Немыкин", "Немытов", "Ненароков", "Ненашев", "Ненашкин", "Неофидов", "Неофитов", "Непейпива", "Непийвода", "Непийпива", "Неплюев", "Непомнящев", "Непомнящий", "Непомнящих", "Непорядин", "Непорядьев", "Непоседов", "Непотягов", "Неприн", "Непряхин", "Непьянов", "Нерадивов", "Нерадин", "Нератаев", "Нератов", "Нерезвый", "Неретин", "Неробов", "Нерожин", "Неронов", "Несветаев", "Несговоров", "Нескромный", "Несмелов", "Несмеянов", "Несоседов", "Нестеренко", "Нестеренков", "Нестерин", "Нестеркин", "Нестеров", "Нестерович", "Нестерук", "Нестерчук", "Несторов", "Неструев", "Несытов", "Несытый", "Нетесов", "Нетудыхата", "Нетужилин", "Нетужилов", "Нетунахин", "Неудахин", "Неудачин", "Неуймин", "Неуков", "Неумоев", "Неумоин", "Неумывакин", "Неумытов", "Неупокоев", "Неупокоин", "Неуронов", "Неусихин", "Неустроев", "Неусыпаев", "Неусыпин", "Неучин", "Неучкин", "Неуютов", "НефЯдов", "НефЯдочкин", "Нефедов", "Нефедочкин", "Нефедьев", "Нефнев", "Нехаев", "Нехлебаев", "Нехлюдов", "Нехорошев", "Нехорошин", "Нехорошкин", "Нехорошков", "Нецветаев", "Нечаев", "Нечай", "Нечепуренко", "Нечипоренко", "Нечистых", "Нечкин", "Нешин", "Нешумов", "Нижегородкин", "Нижегородцев", "Нижник", "Низкоус", "Низовинцев", "Низовитин", "Низовский", "Низовских", "Низовцев", "Никандров", "Никанов", "Никаноров", "Никашин", "Никитаев", "Никитенко", "Никитин", "Никитников", "Никиточкин", "Никитский", "Никитушкин", "Никитцов", "Никитюк", "Никифоров", "Никифоровский", "Никифоряк", "Никишин", "Никишкин", "Никишов", "Никодимов", "Николаев", "Николаевич", "Николаевский", "Николаенко", "Николаенков", "Николаичев", "Николайцев", "Николайчик", "Николахин", "Николашин", "Николенко", "Николин", "Никольский", "Николюкин", "Никомедов", "Никоненко", "Никонов", "Никоноров", "Никончук", "Никуленко", "Никуленков", "Никулин", "Никуличев", "Никулов", "Никулочкин", "Никульников", "Никульцев", "Никульча", "Никульшин", "Никушин", "Никушкин", "Никшин", "Нилин", "Нилов", "Нилус", "Нильский", "Нисанович", "Нисский", "Нистратов", "Нифагин", "Нифантьев", "Нифонтов", "Ниценко", "Ничипоренко", "Ничипоров", "Нишанов", "Нищев", "Ниязов", "Новак", "Новгородкин", "Новгородов", "Новгородский", "Новгородцев", "Новик", "Новиков", "Новицкий", "Новиченко", "Новичихин", "Новичков", "Новодворов", "Новодворский", "Новодворцев", "НоводерЯжкин", "Новодережкин", "Новожилов", "Новокрещенов", "Новокшенов", "Новокшонов", "Новокщенов", "Новолодский", "Новомлинцев", "Новосадко", "Новоселов", "Новосельцев", "Новосильцев", "Новохатский", "Новрузов", "Ногавицын", "Ногаев", "Ногин", "Ноговицын", "Ноготковы", "Ногтевы", "Ноздрев", "Ноздреватый", "Ноздрунков", "Ноздряков", "Номинханов", "Нордов", "Норицын", "Норостов", "Носаев", "Носакин", "Носарев", "Носачев", "Носенков", "Носик", "Носиков", "Носко", "Носков", "Носов", "Носырев", "Носычев", "Нохрин", "Нуждин", "Нужин", "Нумеров", "Нуралиев", "Нурбаков", "Нурбеков", "Нурбердыев", "Нургалиев", "Нуреев", "Нуриев", "Нурмухамедов", "Нурпейсов", "Нурумханов", "Нухимович", "Няников", "Няшин", "", "Обабков", "Обакумов", "Обакшин", "Обарин", "Обатуров", "Обаянцев", "Обезьянинов", "Обернибесов", "Оберучев", "Обиняков", "Обиходов", "Обичкин", "Облонский", "Обнорский", "Обноскин", "Обносков", "Ободин", "Обойдихин", "Оболдуев", "Оболенский", "Оболенцев", "Оболонский", "Оборин", "Оботуров", "Обоянцев", "Образков", "Образский", "Образцов", "Обрезков", "Обреимов", "Обросимов", "Обросов", "Обручев", "Обручин", "Обрютин", "Обрядин", "Обрядков", "Обрядов", "Обутков", "Обухов", "Овдеенко", "Овдей", "Овденко", "Овдий", "Овдин", "Овдокимов", "Овдокин", "Овечкин", "Овидиев", "Овин", "Овинников", "Овинов", "Оводов", "Овросимов", "Овсеев", "Овсяников", "Овсянкин", "Овсянников", "Овсянов", "Овтухов", "Овтын", "Овцын", "Овчаренко", "Овчаров", "Овчинин", "Овчинкин", "Овчинников", "Овчухов", "Огановский", "Огарев", "Огарков", "Огарь", "Огваздин", "Огибалов", "Оглоблин", "Огнев", "Огнивцев", "Огольцов", "Огородников", "Огрызков", "Огуреев", "Огурков", "Огурцов", "Одабашев", "Одинцов", "Однодворов", "Однодворцев", "Однокозов", "Однолюбов", "Однооков", "Однопольцев", "Одноралов", "Однородцев", "Одноруков", "Односельцев", "Односумов", "Одноусов", "Одоевский", "Ожгибесов", "Ожгибоков", "Ожгихин", "Ожегов", "Ожерельев", "Ожжихин", "Ожигаев", "Ожигов", "Ожирков", "Ожогин", "Ожогов", "Озаровский", "Озарьев", "Озерецковский", "Озерковский", "Озерников", "Озерных", "Озеров", "Озиридов", "Ознобихин", "Ознобишин", "Ознобищев", "Озолин", "Окатов", "Окатьев", "Окладников", "Окладчиков", "Оклячеев", "Окоемов", "Окольничников", "Окольнишников", "Оконичников", "Оконишников", "Оконничников", "Оконнишников", "Окороков", "Оксанин", "Оксашин", "Октябрьский", "Окулов", "Окуловский", "Окунев", "Олабугин", "Олабухин", "Оладьин", "Олейник", "Олейников", "Оленев", "Олеников", "Оленин", "Оленичев", "Оленников", "Оленов", "Оленчиков", "Олесов", "Олеханов", "Олехов", "Олеша", "Олешев", "Олешин", "Олешкин", "Олешунин", "Олимпиев", "Олин", "Олисов", "Оловянишников", "Оловянников", "Оловяношников", "Олонцев", "Олпатов", "Олсуфьев", "Олтуфьев", "Олтухов", "Олупкин", "Олупов", "Олуповский", "Олуферов", "Олухнов", "Олухов", "Олферьев", "Ольгин", "Ольгов", "Ольхов", "Ольховский", "Ольшанников", "Олюнин", "Олябышев", "Олябьев", "Олялин", "Омаров", "Омелин", "Омеличкин", "Омельков", "Омельянов", "Омелюсик", "Омелюшкин", "Омеля", "Онегин", "Оненко", "Онисимов", "Онисифоров", "Онищенко", "Онищин", "Онищук", "Онопко", "Оноприенко", "Онопченко", "Оносов", "Онохин", "Оношин", "Оношкин", "Онуфриев", "Онучин", "Онушкин", "Опарин", "Опекушин", "Оплетаев", "Оплетин", "Опоркин", "Опраксин", "Опрокиднев", "Опурин", "Опухтин", "Оранский", "Орданский", "Ордин", "Ордынский", "Ордынцев", "Орел", "Орефьев", "Орехов", "Оречкин", "Орешин", "Орешкин", "Орешков", "Оржаников", "Оржеховский", "Оринкин", "Оришин", "Оришкин", "Орлеанский", "Орлов", "Орловский", "Орнатскии", "Оров", "Орфанов", "Орфеев", "Осеев", "Осенев", "Осенний", "Осетров", "Осиев", "Осиик", "Осин", "Осинин", "Осинкин", "Осинцев", "Осипенко", "Осипов", "Осиповичев", "Осичев", "Осколков", "Осколковых", "Оскрометов", "Ослебятев", "Ослябятев", "Османов", "Осмеркин", "Осминин", "Осмухин", "Осначев", "Осначеев", "Осовецкий", "Осокин", "Осолопов", "Осонов", "Осоргин", "Ососков", "Оссианов", "Останин", "Останкин", "Остапенко", "Остапов", "Остапушкин", "Остапчук", "Остафьев", "Осташев", "Осташков", "Осташов", "Остолопов", "Острейков", "Остренев", "Острецов", "Остробород", "Остробородов", "Островерхов", "Островидов", "Островитинов", "Островитянов", "Островков", "Островский", "Островсков", "Остроглазов", "Острогородский", "Остроградский", "Острогубов", "Острозубов", "Остроносов", "Остропятов", "Остроумов", "Остроухов", "Остроушко", "Острух", "Остряков", "Остужев", "Оськин", "Осьмаков", "Осьмеркин", "Осьминин", "Осьминкин", "Осьмов", "Осьмухин", "Отвагин", "Отделенов", "Отешев", "Откупщиков", "Отопков", "Отраднов", "Отрадной", "Отрадный", "Отрадных", "Отрепьев", "Офицеров", "Офросимов", "Офросинов", "Охапкин", "Охлестов", "Охлестышев", "Охлопков", "Охлябин", "Охотин", "Охоткин", "Охотников", "Охохонин", "Охрименко", "Охримович", "Охромеев", "Охрютин", "Очеретный", "Очин", "Очиров", "Очкасов", "Ошанин", "Ошарин", "Ошаров", "Ошев", "Ошеров", "Ошерович", "Ошерсон", "Ошитков", "Ошмаров", "Ошукин", "Ошурков", "Ошуров", "Ощепков", "Ощепковых", "Ощерин", "", "Павелев   Павельев", "Павенко", "Павин", "Павкин", "Павлеев", "Павленко", "Павленков", "Павленов", "Павленок", "Павлик", "Павликов", "Павлинин", "Павлинов", "Павлис", "Павлихин", "Павлишенцев", "Павлишинцев", "Павлищев", "Павлов", "Павлович", "Павловский", "Павловцев", "Павлоградский", "Павлухин", "Павлухов", "Павлуцкий", "Павлушин", "Павлушкин", "Павлушков", "Павлыгин", "Павлык", "Павлычев", "Павлычин", "Павлюк", "Павлюкевич", "Павлюков", "Павлюковец", "Павлюхин", "Павлюченко", "Павлюченков", "Павлючиков", "Павлючко", "Павлюшенко", "Павлющенко", "Павсикаев", "Павсикацев", "Павушков", "Павшин", "Павшуков", "Пагианин", "Падарин", "Падерин", "Падорин", "Падчерицын", "Падышев", "Пажитнов", "Пакин", "Пакулев", "Пакулин", "Пакулов", "Пакшин", "Палагин", "Палагнюк", "Палагутин", "Палагушин", "Палагушкин", "Паламарчук", "Паламонов", "Палашин", "Палашов", "Палеев", "Палей", "Палемонов", "Паленов", "Палецкий", "Палечек", "Паливода", "Паливодов", "Палий", "Палимпсестов", "Палин", "Палинов", "Палихин", "Палицын", "Паличев", "Палкин", "Палладин", "Палухин", "Палывода", "Пальгин", "Пальгов", "Пальгуев", "Пальгунов", "Пальковский", "Пальмин", "Пальмов", "Пальцев", "Пальчевский", "Пальчиков", "Памфилов", "Панаев", "Панарин", "Панасенко", "Панасов", "Панасович", "Панасюк", "Панафидин", "Паненко", "Панибудьласка", "Паникаров", "Панин", "Панихин", "Паничев", "Паничкин", "Панищев", "Панкеев", "Панкин", "Панков", "Панкратов", "Панкратьев", "Панкрахин", "Панкрашев", "Панкрашин", "Панкрашкин", "Панкрашов", "Панкрухин", "Панкрушин", "Панов", "Пантелеев", "Пантелеенко", "Пантелейкин", "Пантелеймонов", "Пантелькин", "Пантелюхин", "Пантелюшин", "Пантеровский", "Пантин", "Пантюхин", "Пантюхов", "Пантюшин", "Пантюшкин", "Панферов", "Панфиленко", "Панфилов", "Панфилович", "Панфильев", "Панфушин", "Панчев", "Панченко", "Панчин", "Панчишин", "Панчук", "Панчурин", "Паншин", "Панычев", "Панькив", "Панькин", "Паньков", "Паньшин", "Панюгин", "Панюзин", "Панюкин", "Панюков", "Панюнин", "Панютин", "Панюшев", "Панюшин", "Панюшкин", "Паняшкин", "Пап", "Папанин", "Папанов", "Папин", "Папкин", "Папков", "Папкович", "Папов", "Папуша", "Папчихин", "Парадизов", "Парадоксов", "Параев", "Парамонов", "Парамохин", "Парамошин", "Паранин", "Параничев", "Паранюк", "Паратов", "Парахин", "Парашин", "Парашков", "Парашутин", "Паращенко", "Паренсов", "Паригорьев", "Парийский", "Парин", "Паринкин", "Паринов", "Парманин", "Парманьев", "Парменов", "Парменьев", "Пармехин", "Пармешин", "Парнасский", "Пародов", "Паромщиков", "Парохин", "Парусников", "Парусов", "Парухин", "Парфененков", "Парфенин", "Парфенов", "Парфентьев", "Парфенчик", "Парфенчиков", "Парфенычев", "Парфеньев", "Парфенюк", "Парферов", "Парфехин", "Парфешин", "Парфимович", "Парфиненков", "Парфирьев", "Парфишев", "Парфутин", "Пархачев", "Пархоменко", "Пархомов", "Пархомчик", "Пархомчук", "Паршак", "Паршанин", "Паршиков", "Паршин", "Паршуков", "Паршутин", "Паршуткин", "Парщиков", "Парышев", "Пасевич", "Пасечник", "Пасечников", "Пасечный", "Пасикратов", "Пасичнюк", "Пастух", "Пастухов", "Пастушенко", "Пасынков", "Патапов", "Патракеев", "Патраков", "Патрашин", "Патренин", "Патрикевич", "Патрикеев", "Патриков", "Патрин", "Патров", "Патрошкин", "Патрунов", "Патрухин", "Патрушев", "Пауков", "Паустов", "Паустовский", "Паутов", "Пафомов", "Пахарев", "Пахмутов", "Пахоменко", "Пахомов", "Пахомычев", "Пахомьев", "Пахоруков", "Пахотин", "Пахтусов", "Пацаев", "Пацевич", "Паценко", "Паценков", "Пацкевич", "Пашаев", "Пашанин", "Пашанов", "Пашевич", "Пашенин", "Пашенков", "Пашенцев", "Пашеткин", "Пашилов", "Пашин", "Пашинин", "Пашинкин", "Пашинов", "Пашинский", "Пашинцев", "Пашихин", "Пашкевич", "Пашкеев", "Пашкин", "Пашко", "Пашков", "Пашковский", "Пашнев", "Пашнин", "Пашовкин", "Пашук", "Пашунин", "Пашутин", "Пащенко", "Пащин", "Пащук", "Паюсов", "Пвжьянов", "Певец", "Певцов", "Пегов", "Пекарев", "Пекишев", "Пеклов", "Пекунов", "Пекуров", "Пелевин", "Пелевкин", "Пелин", "Пелипенко", "Пелымсих", "Пелымский", "Пелымцев", "Пелымцов", "Пельменев", "Пелявин", "Пенгитов", "Пенежин", "Пензин", "Пенкин", "Пентюк", "Пентюрин", "Пентюхин", "Пенькин", "Пеньков", "Пеньковский", "Пеньковый", "Пенюшин", "Пепелев", "Пепелин", "Пепеляев", "Перваков", "Первенцев", "Первов", "Первозванский", "Первомайский", "Первунин", "Первухин", "Первушин", "Первушкин", "Перебейнос", "Перевалов", "Переведенцев", "Переверзев", "Переверзенцев", "Переверткин", "Перевертов", "Переводчиков", "Перевозкин", "Перевозников", "Перевозчиков", "Перегуда", "Перегудов", "Передельский", "Передний", "Перейма", "Переймов", "Перекатиев", "Перекатов", "Перекладов", "Переладов", "Перелыгин", "Переоридорога", "Перепелица", "Перепелицын", "Перепелка", "Перепелкин", "Перепечин", "Переплетов", "Переплетчиков", "Пересветов", "Переслегин", "Пересторонин", "Пересыпкин", "Перетокин", "Перетягин", "Перехватов", "Переходов", "Перехожих", "Перец", "Перлин", "Перлов", "Пермикин", "Пермин", "Перминов", "Пермитин", "Пермитин(ов)", "Пермитинов", "Пермяков", "Перов", "Перовский", "Перочинцев", "Персианов", "Персидский", "Персиянов", "Перстов", "Перфилов", "Перфильев", "Перфирьев", "Перфишин", "Перфуров", "Перхуров", "Перхурьев", "Перхушин", "Перхушков", "Перцев", "Перцов", "Перчиков", "Першанин", "Першин", "Першуков", "Першутин", "Песельников", "Песенников", "Песенщиков", "Пескарев", "Пескин", "Песков", "Песковский", "Пестерев", "Пестерников", "Пестеров", "Пестов", "Пестриков", "Пестров", "Пеструхин", "Пестрый", "Пестряков", "Пестунов", "Петелин", "Петербургский", "Петешев", "Петин", "Петинов", "Петичев", "Петкевич", "Петкин", "Петраков", "Петрачков", "Петрашевский", "Петрашенко", "Петрашков", "Петрейкин", "Петренко", "Петрив", "Петрик", "Петрикеев", "Петриков", "Петриковский", "Петрилин", "Петрин", "Петрицкий", "Петриченко", "Петричкович", "Петришин", "Петрищев", "Петров", "Петрованов", "Петровец", "Петровичев", "Петровнин", "Петровский", "Петровцев", "Петровчук", "Петровых", "Петропавлов", "Петропавловский", "Петросов", "Петросян", "Петроченко", "Петрошенко", "Петрук", "Петруненко", "Петрунин", "Петруничев", "Петруняк", "Петрусевич", "Петрусенко", "Петрусов", "Петрухин", "Петрухнов", "Петрученя", "Петруша", "Петрушев", "Петрушевский", "Петрушенко", "Петрушенков", "Петрушин", "Петрушка", "Петрушкевич", "Петрушкин", "Петрушов", "Петрущенко", "Петрыкин", "Петрюк", "Петрюня", "Петрягин", "Петряев", "Петряевский", "Петряков", "Петрянин", "Петрянкин", "Петрянов", "Петряшин", "Петряшов", "Петунин", "Петух", "Петухин", "Петухов", "Петушков", "Петыгин", "Петюнин", "Петюшкин", "Петяев", "Петякин", "Петяшин", "Пехтерев", "Печальнов", "Печальный", "Печеников", "Печенин", "Печеницын", "Печенкин", "Печеный", "Печень", "Печерин", "Печерица", "Печерский", "Печерских", "Печиборцев", "Печиброщ", "Печинкин", "Печкин", "Печников", "Печорин", "Печурин", "Печуркин", "Пешехонов", "Пешков", "Пешников", "Пешнин", "Пещериков", "Пещеров", "Пещуров", "Пивень", "Пивнев", "Пивов", "Пивовар", "Пивоваров", "Пивоварчик", "Пивовов", "Пивцаев", "Пивцайкин", "Пигалев", "Пигалеев", "Пигалицин", "Пигарев", "Пигасов", "Пиголицын", "Пиголкин", "Пигулин", "Пидопригора", "Пикаев", "Пикалев", "Пикалов", "Пиканов", "Пикин", "Пиков", "Пикулин", "Пикуль", "Пикульский", "Пикун", "Пикунов", "Пикушин", "Пилипейко", "Пилипенко", "Пилипец", "Пилипиенко", "Пилипчук", "Пилипюк", "Пильщиков", "Пилюгин", "Пилютин", "Пиманин", "Пимахин", "Пимашин", "Пименов", "Пимин", "Пиминов", "Пимонов", "Пимшин", "Пинаев", "Пинегин", "Пинжаков", "Пинженин", "Пинигин", "Пинский", "Пинцев", "Пинчук", "Пинчуков", "Пиньгин", "Пинягин", "Пиняев", "Пионов", "Пионткевич", "Пионтковский", "Пиорковский", "Пирамидов", "Пирог", "Пирогов", "Пироженко", "Пироженков", "Пирожинский", "Пирожихин", "Пирожков", "Пирожников", "Пирров", "Писакин", "Писанин", "Писанко", "Писанов", "Писарев", "Писаревский", "Писаренко", "Писарь", "Писарьков", "Писемский", "Писемцев", "Пискарев", "Писклов", "Писков", "Пискулин", "Пискун", "Пискунов", "Пислегин", "Пислегов", "Пистов", "Пистолетов", "Пистоль", "Писулькин", "Писцов", "Писчиков", "Письмак", "Письмаков", "Письменный", "Письменский", "Письменюк", "Питев", "Питеров", "Питерский", "Питерцев", "Питимиров", "Питин", "Питонов", "Пихтарь", "Пихтовников", "Пичугин", "Пичугов", "Пичужка", "Пичужкин", "Пищаев", "Пищалин", "Пищалкин", "Пищало", "Пищальников", "Пищенко", "Пищик", "Пищиков", "Пищулев", "Пищулин", "Пиянзин", "Плавильщиков", "Плавтов", "Плакидин", "Плакса", "Плаксин", "Пластинин", "Пластов", "Платицын", "Платов", "Платоников", "Платонин", "Платонихин", "Платонников", "Платонов", "Платонычев", "Платохин", "Платошин", "Платошкин", "Платунов", "Платцын", "Платыгин", "Плахов", "Плахотишин", "Плахотнев", "Плахотник", "Плахотников", "Плашин", "Плашинов", "Плащицин", "Плевако", "Плевалов", "Племянников", "Пленкин", "Плескач", "Плесовский", "Плесовских", "Плетенев", "Плетнев", "Плетухин", "Плетюхин", "Плеханов", "Плехов", "Плешаков", "Плешанов", "Плешкевич", "Плешков", "Плещаков", "Плещеев", "Плисецкий", "Плискин", "Плотицын", "Плоткин", "Плотников", "Плотцын", "Плохих", "Плохов", "Плохово", "Плохой", "Плохотников", "Плохотнюк", "Площаднов", "Плужник", "Плужников", "Плюснин", "Плюхин", "Плюшкин", "Плющай", "Плющаков", "Плющев", "Плющенко", "Плющов", "Плясовский", "Плясунов", "Пнин", "Побегайло", "Побегайлов", "Побегалов", "Побегушко", "Победимов", "Победимский", "Победин", "Побединский", "Победнов", "Победоносцев", "Побежимов", "Побритухин", "Побудин", "Повалишин", "Поваляев", "Поваренных", "Поварихин", "Поварков", "Поварнин", "Поварницын", "Поваров", "Поверенный", "Поводов", "Поводырев", "Повозков", "Повытчиков", "Погадаев(1)", "Погадаев(2)", "Поганкин", "Поганов", "Погарелов", "Погиблев", "Погиблов", "Погодаев", "Погодин", "Погожев", "Поголдин", "Погорельский", "Погорельских", "Погорельцев", "Погореляк", "Погребной", "Погребняк", "Погудин", "Погуляев", "Подберезный", "Подберезовиков", "Подболотов", "Подборнов", "Подгаевский", "Подгаецкий", "Подгорков", "Подгорнов", "Подгорный", "Подгузов", "Подгуляев", "Подгурский", "Поддубный", "Поддубский", "Подкаменский", "Подкидышев", "Подколзин", "Подколозин", "Подкользин", "Подлекарев", "Подлесецкий", "Подлеснов", "Подлесный", "Подлесных", "Подобедов", "Подовинников", "Подойников", "Подойницын", "Подоколзин", "Подоконников", "Подольников", "Подольский", "Подоляк", "Подолян", "Подолянчук", "Подомарев", "Подопригора", "Подопрыгоров", "Подосенков", "Подосенов", "Подосинов", "Подосиновиков", "Подпругин", "Подречнев", "Подружкин", "Подрябинников", "Подрядчиков", "Подскребкин", "Подсобляев", "Подсохин", "Подтелков", "Подтынников", "Подхалюзин", "Подхолзин", "Подчерняев", "Подчуфаров", "Подшибякин", "Подшивалов", "Подъяблонский", "Подыминогин", "Подьячев", "Подьячих", "Пожар", "Пожаров", "Пожарский", "Пожидаев", "Пожилов", "Пожников", "Позвонков", "Поздеев", "Поздееский", "Поздин", "Позднев", "Позднеев", "Поздников", "Позднов", "Позднышев", "Поздняков", "Поздышев", "Познухов", "Познышев", "Позняк", "Позняков", "Познянский", "Позолотников", "Позолотчиков", "Покатилов", "Покидаев", "Покидалов", "Покинчереда", "Покровов", "Покровский", "Полагутин", "Полаткин", "Полев", "Полевиков", "Полевов", "Полевой", "Полевский", "Полевщиков", "Полевых", "Полегаев", "Полеев", "Полежаев", "Полейчук", "Поленков", "Поленов", "Полетавкин", "Полетаев", "Полеха", "Полехов", "Полешкин", "Полещук", "Полещуков", "Ползунов", "Поливанов", "Поливода", "Полигнотов", "Полиевктов", "Полиенко", "Полиентов", "Поликанин", "Поликанов", "Поликаров", "Поликарпов", "Поликарпочкин", "Поликахин", "Поликашев", "Поликашин", "Поликеев", "Поликушин", "Полин", "Полинин", "Политковский", "Политов", "Политыко", "Полихов", "Полихронтьев", "Поличев", "Полишко", "Полищук", "Полканов", "Полковник", "Полковников", "Половин", "Половинка", "Половинкин", "Половинщиков", "Половников", "Половцев", "Половцов", "Полозков", "Полозов", "Полонский", "Полонянкин", "Полоротов", "Полстовалов", "Полтавский", "Полтаракин", "Полтарыгин", "Полтев", "Полтинин", "Полтинников", "Полтинягин", "Полторацкий", "Полубайдаков", "Полубаринов", "Полубесов", "Полубинский", "Полубояринов", "Полубояров", "Полубоярцев", "Полувалов", "Полуведеркин", "Полуверцев", "Полуветров", "Полудворов", "Полуденщиков", "Полудесятников", "Полудольнов", "Полудольный", "Полудомников", "Полуектов", "Полуехтов", "Полуешкин", "Полукаров", "Полукарпов", "Полукафтанов", "Полумордвинов", "Полунин", "Полуничев", "Полунцев", "Полупанов", "Полуполковников", "Полупуднев", "Полусаблин", "Полусветов", "Полутатаринов", "Полутин", "Полутяглов", "Полухвосткин", "Полухин", "Полухтов", "Полушин", "Полушкин", "Полуэктов", "Полуян", "Полуянов", "Полферов", "Полынцев", "Полькин", "Польский", "Польшин", "Полюдов", "Полюсов", "Полюхин", "Полюхов", "Полюшкин", "Поляк", "Поляков", "Поляничкин", "Полянский", "Полянчиков", "Полянчич", "Померанцев", "Помещиков", "Поморцев", "Помяловский", "Понамарев", "Понамаренко", "Понарин", "Понедельников", "Пономарев", "Пономаренко", "Понофидин", "Понтрягин", "Понькин", "Попадейкин", "Попадьин", "Попиков", "Попков", "Поплавский", "Попов", "Попович", "Поповкин", "Поповский", "Попок", "Поползнев", "Попрядухин", "Попугаев", "Попцов", "Попченков", "Попышев", "Порозов", "Поромов", "Поротиков", "Поротов", "Порох", "Порохов", "Портнов", "Портной", "Портнягин", "Портняков", "Портянников", "Порфирьев", "Порфирьюшкин", "Порфишин", "Поршнев", "Порываев", "Посадов", "Посадский", "Посейдонов", "Посельский", "Поскребышев", "Посников", "Пособилов", "Посохин", "Посохов", "Посошков", "Посошнов", "Поспеев", "Поспелов", "Поспехин", "Постельников", "Постников", "Постнов", "Постовалов", "Постовский", "ПотЯмкин", "Потанин", "Потапенко", "Потапов", "Потапочкин", "Потапушин", "Потапчук", "Потапьев", "Потемин", "Потемкин", "Потеряхин", "Потехин", "Потешин", "Потешкин", "Поткин", "Потушняк", "Похабов", "Похлебкин", "Похоруков", "Похотин", "Почечуев", "Почивалов", "Почтарь", "Почтовый", "Пошехонов", "Поярков", "Поясников", "Правда", "Правдивцев", "Правдин", "Правосудов", "Прадедов", "Пральников", "Праслов", "Прасолов", "Прахов", "Праценко", "Предводителев", "Предтеченский", "Преображенский", "Преснухин", "Пресняков", "Преферансов", "Пржевальский", "Пржибыловский", "Приблов", "Прибылев", "Прибыловский", "Прибытков", "Прибытковский", "Привалкин", "Привалков", "Привалов", "ПриведЯнышев", "Приведенышев", "Привезенцев", "Привизенцев", "Пригодин", "Приезжев", "Приезжий", "Приймак", "Прилежаев", "Прилепский", "Прилепсков", "Прилипский", "Прилуцкий", "Примак", "Примаков", "Примеров", "Принцев", "Приоров", "Пристяжников", "Пристяжнов", "Присяжнов", "Приходченко", "Приходько", "Пришвин", "Проводин", "Проводов", "Прозоркин", "Прозоров", "Прозоровский", "Прозуменщиков", "Прокашев", "Прокин", "Проклов", "Проконичев", "Проконов", "Прокоп", "Прокопенко", "Прокопец", "Прокопишин", "Прокопов", "Прокопович", "Прокопченко", "Прокопчук", "Прокопьев", "Прокофин", "Прокофьев", "Прокошев", "Прокошин", "Прокошкин", "Прокудин", "Прокунин", "Прокшин", "Пролубщиков", "Промптов", "Промский", "Промтов", "Проненко", "Пронин", "Проничев", "Проничкин", "Пронкин", "Пронов", "Пронович", "Прончищев", "Пронькин", "Проняев", "Пронякин", "Проняков", "Прорубников", "Просвирин", "Просвиркин", "Просвирнин", "Просвирницын", "Просвирнов", "Просвиров", "Просвиряков", "Просдоков", "Проскудин", "Проскунин", "Проскурин", "Проскурников", "Проскурнин", "Проскуряков", "Просоедов", "Простов", "Простяков", "Протазанов", "Протасов", "Протасьев", "Протов", "Протогенов", "Протозанов", "Протоклитов", "Протопопов", "Прохватилов", "Прохнов", "Прохоренко", "Прохорихин", "Прохоров", "Прохорович", "Прохорцев", "Прохорычев", "Проценко", "Процко", "Процюк", "Прошин", "Прошкин", "Прошунин", "Прощалыгин", "Прощенков", "Прудков", "Прудников", "Прусаков", "Прусин", "Прядеин", "Прядка", "Прядкин", "Прядко", "Прялин", "Прямиков", "Пряничников", "Прянишников", "Пряхин", "Псаломщиков", "Псковитин", "Псковитинов", "Пташкин", "Пташник", "Птицин", "Птицын", "Птичкин", "Птолемеев", "Пугач", "Пугачев", "Пудашев", "Пудиков", "Пудков", "Пудов", "Пудовиков", "Пудовичков", "Пудовкин", "Пудовщиков", "Пудров", "Пудышев", "Пузанков", "Пузанов", "Пузаткин", "Пузатов", "Пузевич", "Пузенко", "Пузик", "Пузиков", "Пузин", "Пузырев", "Пукирев", "Пупенко", "Пупков", "Пупов", "Пупырев", "Пупышев", "Пустельников", "Пустилов", "Пустобояров", "Пустовалов", "Пустовойтов", "Пусторослев", "Пустоселов", "Пустошкин", "Пустыльников", "Пустынников", "Путилин", "Путилов", "Путин", "Путинцев", "Путнин", "Путяев", "Путятин", "Пухликов", "Пухов", "Пучкин", "Пучков", "Пушкарев", "Пушкаренко", "Пушкарный", "Пушкарский", "Пушкарь", "Пушкин", "Пуштаев", "Пчелинцев", "Пшеничников", "Пшеничный", "Пшенников", "Пыжиков", "Пыжов", "Пыжьев", "Пырьев", "Пыхов", "Пышкин", "Пьянзин", "Пьяниченко", "Пьянков", "Пьянов", "Пьяных", "Пянзин", "Пятаев", "Пятайкин", "Пятаков", "Пятанов", "Пятеренюк", "Пятериков", "Пятерня", "Пятибоков", "Пятибратов", "Пятилеткин", "Пятилов", "Пяткин", "Пятницкий", "Пятов", "Пятунин", "Пятых", "", "Рабин", "Рабинов", "Рабинович", "Работин", "Работягов", "Рабочее", "Раввинов", "Равинский", "Рагимов", "Рагоза", "Рагозин", "Рагозинин", "Рагозинский", "Радзинский", "Радивонов", "Радик", "Радилов", "Радимов", "Радин", "Радионов", "Радихин", "Радищев", "Радкевич", "Радлов", "Радонежский", "Радошковский", "Радугин", "Радушин", "Радченко", "Радченя", "Радчук", "Радько", "Радьков", "Радюк", "Радюкевич", "Радяев", "Раев", "Раевский", "Ражединов", "Разамасцев", "Разбитнов", "Разбойников", "Развалихин", "Разгилдеев", "Разгильдеев", "Разгильдяев", "Разгонов", "Разгуляев", "Разделишин", "Раздеришин", "Раздетов", "Раздобарин", "Раздольский", "Раздьяконов", "Раззоренов", "Разин", "Разинин", "Разносчиков", "Разносщиков", "Разнощиков", "Разоренов", "Разуваев", "Разумнов", "Разумов", "Разумовский", "Разшибихин", "Разыграев", "Разьяришин", "Раинин", "Райков", "Райковский", "Райнес", "Райнин", "Райнис", "Райский", "Ракитин", "Ракитников", "Раков", "Раковский", "Ракоед", "Ракчеев", "Рамаданов", "Рамазанов", "Раменский", "Раменьев", "Рамзаев", "Рамзайцев", "Рамзин", "Ранцов", "Рапидов", "Расин", "Раскин", "Раскольников", "Раскошный", "Раскошных", "Раслин", "Распопин", "Распопов", "Распутин", "Рассадин", "Рассохин", "Расстригин", "Рассудов", "Растеряев", "Растов", "Растопчин", "Расторгуев", "Расщупкин", "Ратаев", "Рататуев", "Ратманов", "Ратников", "Рахимов", "Рахимьянов", "Рахманин", "Рахманинов", "Рахманов", "Рахматов", "Рахматуллин", "Рахметов", "Рачков", "Рачковский", "Рашидов", "Рашитов", "Ращупкин", "Реадов", "Ребриков", "Ребров", "Ребровский", "Ревельский", "Ревин", "Ревков", "Ревнивый", "Ревнивых", "Ревокатов", "Ревунов", "Ревякин", "Редин", "Редкин", "Редков", "Редкоребров", "Редриков", "Редров", "Редькин", "Редько", "Резаков", "Резанко", "Резанов", "Резанович", "Резванов", "Резвецов", "Резвов", "Резвунин", "Резвунов", "Резвухин", "Резвушин", "Резвый", "Резвых", "Резвышин", "Резвяков", "Резеньков", "Резник", "Резников", "Резницын", "Резовников", "Резунин", "Резунов", "Резухин", "Резцов", "Резчиков", "Резщиков", "Релин", "Ремезов", "Ременников", "Ремизов", "Ремин", "Ренев", "Ренин", "Репа", "Репехов", "Репин", "Репинский", "Репкин", "Репников", "Репнин", "Репьев", "Реука", "Реунов", "Реут", "Реутов", "Реутский", "Реутских", "Реуцкий", "Реуцков", "Реформаторский", "Решетин", "Решетников", "Решетняк", "Решетов", "Ржавский", "Ржавый", "Ржаединов", "Ржевитин", "Ржевитин(ов)", "Ржевитинов", "Ржевский", "Ржондковский", "Ривес", "Ривинсон", "Ривкер", "Ривкерман", "Ривкин", "Ривкович", "Ривлин", "Ривман", "Римский", "Рог", "Рогалев", "Рогалевич", "Рогалин", "Рогалюхин", "Рогаля", "Роганков", "Роганов", "Рогатин", "Рогаткин", "Рогатников", "Рогаточников", "Рогатый", "Рогачев", "Рогов", "Рогованов", "Роговиков", "Роговой", "Роговский", "Роговцев", "Роговцов", "Рогожин", "Рогожников", "Рогозин", "Рогулин", "Рогульский", "Рогушин", "Родзевич", "Родзионтковский", "Родивонов", "Родигин", "Родимов", "Родимцев", "Родин", "Родинков", "Родинцев", "Родионов", "Родионычев", "Родиошин", "Родичев", "Родичин", "Родичкин", "Роднин", "Родыгин", "Родюков", "Родюшин", "Родяков", "Рождественский", "Рожественский", "Рожкин", "Рожков", "Рожнецов", "Рожнин", "Рожнов", "Розанов", "Розов", "Розстригин", "Розторгуев", "Рокотов", "Ромадин", "Ромадинов", "Роман", "Романенко", "Романенков", "Романив", "Романин", "Романихин", "Романишин", "Романко", "Романков", "Романов", "Романович", "Романовский", "Романский", "Романушкин", "Романцев", "Романцов", "Романчев", "Романченко", "Романчук", "Романычев", "Романько", "Романьков", "Романюгин", "Романюк", "Романюков", "Ромасин", "Ромахин", "Ромахов", "Ромашенко", "Ромашин", "Ромашихин", "Ромашкин", "Ромашко", "Ромашков", "Ромашов", "Ромащев", "Ромащенко", "Ромейков", "Ромин", "Роминов", "Ромоданов", "Ромодановский", "Ромулин", "Ромулов", "Ромшин", "Ромыш", "Ронжин", "Ронин", "Роскошный", "Роскошных", "Рославлев", "Рослов", "Рослый", "Росляков", "Росомахин", "Россомахин", "Ростов", "Ростовский", "Ростовцев", "Ростовщиков", "Ростопчин", "Росторгуев", "Ростоцкий", "Росчупкин", "Ротмистров", "Рохин", "Рохлин", "Рохляков", "Рохманинов", "Рохманов", "Рочагов", "Рочегов", "Рощенко", "Рощин", "Рощупкин", "Ртищев", "Рубан", "Рубанов", "Рубахов", "Рублев", "Рубцов", "Рудаков", "Рудалев", "Руделев", "Руденко", "Руденков", "Руденок", "Рудик", "Рудин", "Рудинский", "Рудкин", "Рудлев", "Руднев", "Рудников", "Рудницкий", "Рудной", "Рудный", "Рудов", "Рудометов", "Ружников", "Рузавин", "Рузайкин", "Рузанов", "Рузанский", "Рузанцев", "Рузский", "Рукавичников", "Рукавишников", "Румянцев", "Русаков", "Русан", "Русанов", "Русин", "Русинов", "Русинович", "Русков", "Русланов", "Русняк", "Русских", "Рухин", "Рухлин", "Рухман", "Ручьев", "Рыбак", "Рыбакин", "Рыбаков", "Рыбалкин", "Рыбалко", "Рыбальский", "Рыбанов", "Рыбачев", "Рыбачок", "Рыбин", "Рыбицкий", "Рыбка", "Рыбкин", "Рыбник", "Рыбников", "Рыбницкий", "Рыбницын", "Рыбнов", "Рыболов", "Рыболовлев", "Рыбочкин", "Рыбушкин", "Рыбчевский", "Рыбчин", "Рывкин", "Рывлин", "Рыжаков", "Рыжиков", "Рыжих", "Рыжков", "Рыжов", "Рыкалов", "Рыкачев", "Рыквский", "Рыков", "Рыкунов", "Рылеев", "Рыленков", "Рылов", "Рымар", "Рымарев", "Рымаркевич", "Рыморев", "Рындин", "Рындяев", "Рысаков", "Рысев", "Рысин", "Рытиков", "Рычалов", "Рычков", "Рышков", "Рюмин", "Рюмшин", "Рютин", "Рябенко", "Рябиков", "Рябинин", "Рябинкин", "Рябинников", "Рябов", "Рябой", "Рябошапка", "Рябоштан", "Рябуха", "Рябухин", "Рябухов", "Рябушинский", "Рябушкин", "Рябцев", "Рябцов", "Рябченко", "Рябченков", "Рябышкин", "Рявкин", "Рядовкин", "Ряжский", "Ряжских", "Рязанов", "Рязанский", "Рязанцев", "Ряхин", "Ряшенцев", "", "Сабанеев", "Сабанов", "Сабачников", "Сабашников", "Сабельников", "Сабинин", "Саблин", "Саблуков", "Сабуров", "Саванин", "Саванов", "Савастеев", "Саватеев", "Саватейкин", "Саватьев", "Савватеев", "Савватин", "Саввин", "Саввинский", "Саввушкин", "Савеленок", "Савеличев", "Савелов", "Савельев", "Савелюк", "Савенко", "Савенков", "Савенок", "Савилов", "Савин", "Савинков", "Савинов", "Савиновский", "Савинский", "Савинцев", "Савиных", "Савиткин", "Савицкий", "Савич", "Савичев", "Савкин", "Савков", "Савкун", "Савнов", "Савонин", "Савоничев", "Савонишев", "Савонов", "Савосин", "Савостин", "Савостьянов", "Савоськин", "Савочкин", "Саврасов", "Саврасухин", "Савуков", "Савушкин", "Савчак", "Савченко", "Савченков", "Савчиц", "Савчук", "Сагал", "Сагалаев", "Сагалов", "Сагалович", "Садаков", "Садиков", "Садков", "Садковский", "Садов", "Садовник", "Садовников", "Садовниченко", "Садовничий", "Садовский", "Садовчук", "Садовщиков", "Садомов", "Садонин", "Садофов", "Садофьев", "Садохин", "Садохов", "Садчиков", "Садыгов", "Садыков", "Садырев", "Садысов", "Саенко", "Сажин", "Сазанов", "Сазиков", "Сазонов", "Сазончик", "Сазыкин", "Саидмамедов", "Сайкин", "Сайко", "Сайков", "Сайфутдинов", "Сакевич", "Саков", "Сакович", "Саксонов", "Сакулин", "Саламатин", "Саламатов", "Саламов", "Саликов", "Салимов", "Салин", "Салихов", "Салищев", "Салманов", "Салманов", "Салмин", "Салов", "Саломатин", "Салтанов", "Салтыков", "Салтырев", "Салтычев", "Салтычков", "Салынский", "Сальников", "Сальцов", "Самалов", "Самарин", "Самарский", "Самарцев", "Самарянин", "Самбурский", "Самобратов", "Самоверов", "Самогонов", "Самодвигин", "Самодвигов", "Самоделкин", "Самодергин", "Самодов", "Самодумский", "Самодуров", "Самойленко", "Самойлик", "Самойлин", "Самойличенко", "Самойлов", "Самокрасов", "Самокрутов", "Самолетов", "Самолов", "Самоловов", "Самолюк", "Самонов", "Самопалов", "Самоплясов", "Самопрядкин", "Самопрялин", "Самопялов", "Самородов", "Самороков", "Самороковский", "Саморядов", "Самосадный", "Самосадов", "Самосадский", "Самосватов", "Самосекин", "Самосенко", "Самославов", "Самосов", "Самострелов", "Самосудов", "Самосюк", "Самотекин", "Самотечкин", "Самотин", "Самотоков", "Самоуков", "Самофалов", "Самохвал", "Самохвалов", "Самохин", "Самохоткин", "Самоцветов", "Самочернов", "Самошин", "Самошкин", "Самошников", "Самсоненков", "Самсонов", "Самсононычев", "Самсонян", "Самуилов", "Самуйленков", "Самулев", "Самунин", "Самусев", "Самусенко", "Самусьев", "Самухин", "Самыгин", "Самылин", "Самылкин", "Самылов", "Самышин", "Самышкин", "Санаев", "Санбуров", "Сандальнов", "Санджеев", "Санджиев", "Сандунов", "Санеев", "Санжеев", "Санин", "Саничкин", "Санкин", "Санков", "Санников", "Санов", "Санькин", "Санько", "Саньков", "Санютин", "Сапаев", "Сапелкин", "Сапельников", "Сапогов", "Сапожков", "Сапожников", "Сапон", "Сапоненко", "Сапончик", "Сапронов", "Сапронцев", "Сапрончик", "Сапрунов", "Сапрыгин", "Сапрыкин", "Сапунов", "Сарана", "Саранский", "Саранцев", "Саранчев", "Саранчин", "Саранчук", "Сарапулов", "Сарачев", "Сарбин", "Саржин", "Сартаков", "Сартов", "Сарычев", "Сасин", "Сасов", "Сатанин", "Сатанищев", "Сатаров", "Сатин", "Сатурнов", "Саульский", "Саушкин", "Сафин", "Сафокин", "Сафоненко", "Сафоников", "Сафонин", "Сафонников", "Сафонов", "Сафонцев", "Сафошин", "Сафрин", "Сафронов", "Сафрыгин", "Сафьянов", "Сахар", "Сахаревич", "Сахарных", "Сахаров", "Сахневич", "Сахнин", "Сахно", "Сахнов", "Сахновский", "Сахоненко", "Сашенков", "Сашин", "Сашихин", "Сашкин", "Сашко", "Сашков", "Саянов", "Сбитеньщиков", "Сбитнев", "Сбитяков", "Сборщиков", "Сбродов", "Свадьбин", "Свалов", "Сведенцев", "Свербеев", "Свергун", "Свергуненко", "Свердлов", "Свериденко", "Сверлов", "Сверчевский", "Сверчков", "Светиков", "Светлаев", "Светланин", "Светланов", "Светлицкий", "Светлолобов", "Светлышев", "Светляков", "Светов", "Светолюбов", "Светочев", "Светушкин", "Свечников", "Свешников", "Свиблов", "Свилев", "Свинарев", "Свинарский", "Свиницын", "Свинкин", "Свинобой", "Свиногонов", "Свиногузов", "Свинолобов", "Свинолупов", "Свинопасов", "Свинухин", "Свинухов", "Свиньев", "Свиньин", "Свириденко", "Свиридов", "Свиридовский", "Свиридонов", "Свиридченков", "Свирин", "Свиринников", "Свирчевский", "Свирякин", "Свистельников", "Свистульник", "Свистун", "Свистунов", "Свищ", "Свищев", "Свиягин", "Свияженин", "Свияженинов", "Свияженов", "Свободин", "Сворочаев", "Сгибнев", "Сдатчиков", "Себастьянская", "Севастьянов", "Севатьянов", "Север", "Севергин", "Северин", "Северинов", "Севернин", "Северный", "Северов", "Северовостоков", "Северский", "Северухин", "Северцов", "Северьянов", "Северюхин", "Северяни", "Н", "Севидов", "Севиров", "Севостей", "Севостьянов", "Севрук", "Севрюгин", "Севрюгов", "Севрюков", "Сегал", "Сегалов", "Сегалович", "Сегаль", "Сеголь", "Седельников", "Седлов", "Седов", "Седой", "Седоплатов", "Седухин", "Седых", "Седышев", "Секачев", "Секирин", "Секретарев", "Секунов", "Селвин", "Селевачев", "Селевин", "Селевич", "Селедкин", "Селедков", "Селезенкин", "Селезнев", "Селенин", "Селехов", "Селиванкин", "Селиванов", "Селивановский", "Селивантьев", "Селиванцев", "Селивахин", "Селивашкин", "Селиверстов", "Селивонов", "Селиков", "Селимов", "Селин", "Селитренников", "Селитринников", "Селифанов", "Селифонов", "Селифонтов", "Селихов", "Селищев", "Селкин", "Сельвинский", "Сельдин", "Сельков", "Селюгин", "Селюк", "Селюков", "Селюнин", "Селютин", "Селюхин", "Селюшкин", "Селянинов", "Селянкин", "Семагин", "Семаго", "Семак", "Семаков", "Семанин", "Семанов", "Семахин", "Семачкин", "Семашко", "Семеикин", "Семендяев", "Семененко", "Семенец", "Семеников", "Семенихин", "Семеница", "Семенищ", "Семенищев", "Семенкин", "Семенко", "Семенков", "Семенников", "Семенов", "Семеновский", "Семенцов", "Семенченко", "Семенчиков", "Семенчук", "Семенычев", "Семенюк", "Семенюта", "Семенютин", "Семенюшкин", "Семеняго", "Семеняка", "Семеняченко", "Семеоненко", "Семериков", "Семерник", "Семернин", "Семестрельник", "Семечев", "Семечкин", "Семешин", "Семибратов", "Семиврагов", "Семиглазов", "Семигорелов", "Семигук", "Семидевкин", "Семидоцкий", "Семиженов", "Семижонов", "Семизоров", "Семик", "Семикашев", "Семикин", "Семиков", "Семикозов", "Семиколенных", "Семиколенов", "Семикопный", "Семилетников", "Семилетов", "Семин", "Семиноженко", "Семиотрочев", "Семириков", "Семирот", "Семиселов", "Семихаткин", "Семихатов", "Семичастнов", "Семичастный", "Семичев", "Семищев", "Семкин", "Семко", "Семов", "Семочкин", "Семухин", "Семушкин", "Семченко", "Семченков", "Семченок", "Семчихин", "Семыкин", "Семычев", "Семяхин", "Семяхов", "Семяшкин", "Сенаторов", "Сенацкий", "Сенекин", "Сенектутин", "Сенилин", "Сенин", "Сеничев", "Сеничкин", "Сенищев", "Сенкевич", "Сенник", "Сенников", "Сенокосов", "Сенотрусов", "Сенофонов", "Сенофонтов", "Сентюлев", "Сентюрин", "Сентюрихин", "Сенченко", "Сенчин", "Сенчихин", "Сенчищев", "Сенчугов", "Сенчук", "Сенькив", "Сенькин", "Сенько", "Сеньков", "Сеньшин", "Сенюрин", "Сенюхин", "Сенюшин", "Сенюшкин", "Сенявин", "Сенягин", "Сепаратов", "Серафимин", "Серафимович", "Сербин", "Сербинов", "Сербул", "Серганов", "Сергач", "Сергачев", "Сергевин", "Сергевнин", "Сергеев", "Сергеевичев", "Сергеенко", "Сергеенков", "Сергеичев", "Сергей", "Сергейчев", "Сергиев", "Сергиевский", "Сергиенко", "Сергин", "Сергов", "Сергошко", "Сергулин", "Сергун", "Сергунин", "Сергунков", "Сергунов", "Сергунчиков", "Сергусин", "Сергушев", "Сергушин", "Сердитов", "Сердитых", "Сердюк", "Сердюков", "Сердюченко", "Серебреников", "Серебренников", "Серебров", "Серебровский", "Серебряков", "Серебряников", "Серебрянников", "Серебрянский", "Серебряный", "Серегин", "Серегов", "Середа", "Середин", "Сереженко", "Сережечкин", "Сережин", "Сережичев", "Сережников", "Сержантов", "Сериков", "Серкин", "Серков", "Серов", "Серогузов", "Серокващенко", "Сероухов", "Сероштан", "Сероштанов", "Серпухов", "Серпуховитин", "Серый", "Серых", "Серышев", "Серяков", "Сеславин", "Сеченов", "Сибилев", "Сибиль", "Сибильский", "Сибирков", "Сибирцев", "Сивак", "Сиваков", "Сиваньков", "Сиваченко", "Сиверков", "Сивец", "Сивков", "Сивоволов", "Сивоглазов", "Сивожелезов", "Сиволап", "Сиволобов", "Сивохин", "Сивухин", "Сивцев", "Сивцов", "Сивяков", "Сигайлов", "Сигалов", "Сигов", "Сигулев", "Сидельников", "Сиденко", "Сидин", "Сиднев", "Сиднин", "Сидняев", "Сидоренко", "Сидоренков", "Сидорин", "Сидоришин", "Сидоркин", "Сидорко", "Сидорков", "Сидоров", "Сидорович", "Сидоровнин", "Сидорочкин", "Сидорский", "Сидорук", "Сидоршин", "Сидорычев", "Сидорюк", "Сидочук", "Сидягин", "Сидякин", "Сидяков", "Сизев", "Сизиков", "Сизов", "Сизоненко", "Сизых", "Сизяков", "Сикерин", "Сикетин", "Сикушин", "Силаев", "Силаков", "Силанов", "Силантьев", "Силашин", "Силев", "Силиенко", "Силин", "Силичев", "Силкин", "Силко", "Силков", "Силов", "Силуянов", "Сильванович", "Сильверстов", "Сильвестов", "Сильвестров", "Сильвестрович", "Сильвин", "Сильченко", "Силюков", "Симагин", "Симакин", "Симаков", "Симанин", "Симанков", "Симанов", "Симанович", "Симарев", "Симахин", "Симачов", "Симашко", "Симбирский", "Симбирцев", "Сименеев", "Сименькевич", "Симеонов", "Симион", "Симка", "Симкин", "Симков", "Симов", "Симон", "Симоненко", "Симоненков", "Симонин", "Симонов", "Симонович", "Симонцев", "Симончик", "Симочков", "Симуков", "Симулин", "Симунин", "Симушин", "Синайский", "Синебрюхов", "Синев", "Синеглазов", "Синегуб", "Синегубкин", "Синегубов", "Синезубов", "Синелобов", "Синельников", "Синельщиков", "Синеокий", "Синеоков", "Синепупов", "Синерукий", "Синещеков", "Синильников", "Синильщиков", "Синица", "Синицин", "Синицкий", "Синицын", "Синичкин", "Синкевич", "Синофонов", "Синофонтов", "Синцеров", "Синцов", "Синькевич", "Синькин", "Синько", "Синьков", "Синюгин", "Синюков", "Синявин", "Синявский", "Синяев", "Синяк", "Синякин", "Синяков", "Синяченко", "Сипачев", "Сипягин", "Сирота", "Сиротин", "Сиротинин", "Сироткин", "Ситник", "Ситников", "Ситчихин", "Сифоров", "Сицкий", "Сказкин", "Скакун", "Скакунов", "Скалкин", "Скалозубов", "Скарятин", "Сквиридонов", "Сквирский", "Скворцов", "Скиба", "Скибин", "Скибкин", "Скирдин", "Скирдов", "Склемин", "Склифосовский", "Скляр", "Скляренко", "Скляров", "Скобеев", "Скобелев", "Скобелкин", "Скобель", "Скобельцын", "Скоблев", "Скоблик", "Скобликов", "Скоблилин", "Скоблилов", "Скоблильщиков", "Скоблин", "Скоблиякин", "Скоблов", "Сковорода", "Сковородин", "Сковородник", "Сковородников", "Сковородов", "Скок", "Скоков", "Скокун", "Сколоватов", "Скоморохов", "Скопин", "Скопинцев", "Скопцов", "Скорик", "Скориков", "Скорняков", "Скоробогатов", "Скоробогатый", "Скоробогатых", "Скоробогач", "Скоробранцев", "Скороделов", "Скородомов", "Скородумов", "Скорожиров", "Скорокладов", "Скоролупов", "Скоромолов", "Скоропад", "Скоропадский", "Скорописцев", "Скорописчиков", "Скоропись", "Скоропупов", "Скороспелов", "Скороспехов", "Скорохватов", "Скороход", "Скороходов", "Скорын", "Скорына", "Скорятин", "Скосарев", "Скосырев", "Скребнев", "Скржипковский", "Скрипак", "Скрипач", "Скрипачев", "Скрипеев", "Скрипилев", "Скрипин", "Скрипицын", "Скрипка", "Скрипкин", "Скрипник", "Скрипников", "Скриптунов", "Скрозников", "Скрылев", "Скрыленко", "Скрыль", "Скрыльников", "Скрынник", "Скрынников", "Скрыпеев", "Скрыпицин", "Скрыплев", "Скрыплов", "Скрыпник", "Скрыпников", "Скрыпунин", "Скрыпушкин", "Скрябин", "Скрягин", "Скубенко", "Скубченко", "Скугарев", "Скудатин", "Скуловатов", "Скупов", "Скуратов", "Скуратович", "Скурин", "Скурихин", "Скурлыгин", "Скуров", "Скурятин", "Слабженинов", "Слабинский", "Слабнов", "Слабченко", "Слабый", "Славаныч", "Славгородский", "Славин", "Славинский", "Славицкий", "Славич", "Славкин", "Славный", "Славонич", "Славутин", "Славянинов", "Славянов", "Сладкий", "Сладкин", "Сладких", "Сладков", "Сластунов", "Слащилин", "Слащов", "Слепаков", "Слепенков", "Слепко", "Слепнев", "Слепов", "Слепой", "Слепокуров", "Слепухин", "Слепушкин", "Слепцов", "Слепченко", "Слепчин", "Слепых", "Слепышев", "Слесарев", "Слесаренко", "Сливерсткин", "Слипый", "Слобода", "Слободин", "Слободнюк", "Слободских", "Слободской", "Слободчиков", "Слободян", "Слободяников", "Слобожанин", "Слонимский", "Слонов", "Слузов", "Слуцкий", "Случак", "Случевский", "Слюсар", "Слюсарев", "Слюсаренко", "Слюсаров", "Слюсарь", "Слюсарюк", "Смагин", "Смазнухин", "Смарагдов", "Смекалкин", "Смекалков", "Смекалов", "Смелков", "Смелов", "Смельняк", "Смеляков", "Смелянский", "Смердов", "Смертин", "Сметана", "Сметанин", "Сметанников", "Сметанщиков", "Смехов", "Смилянский", "Смиренкин", "Смиренко", "Смиренский", "Смирнин", "Смирнитский", "Смирнов", "Смирновский", "Смирнягин", "Смоктунов", "Смоктуновский", "Смоленков", "Смоленов", "Смоленский", "Смоленцев", "Смолин", "Смолкин", "Смологонов", "Смолоктин", "Смольников", "Смоляк", "Смоляков", "Смолянинов", "Смолянов", "Смолянский", "Смоляров", "Сморыго", "Смотров", "Смотряев", "Смураго", "Смуров", "Смурыгин", "Смык", "Смыков", "Смыслов", "Смышляев", "Смышляков", "Снагин", "Снаговский", "Снегирев", "Снегов", "Снегур", "Снежинский", "Снежко", "Снетков", "Снигирев", "Снижко", "Собакаев", "Собакарев", "Собакин", "Собакинский", "Собакинских", "Собаков", "Собачников", "Собашников", "Собин", "Собинин", "Собинкин", "Собинов", "Соболев", "Соболевский", "Соболь", "Собольщиков", "Сова", "Советский", "Совин", "Согрин", "Содомов", "Создомов", "Созин", "Созинов", "Созонов", "Созонюк", "Созыкин", "Сойкин", "Соймонов", "Соков", "Соковиков", "Соковников", "Соковнин", "Сокол", "Соколенко", "Соколик", "Соколин", "Соколинский", "Соколихин", "Соколкин", "Соколов", "Соколовский", "Сокологорский", "Сокольников", "Сокольский", "Сокольцов", "Сокольчик", "Соколянский", "Соктеев", "Соктоев", "Соларев", "Солдатенко", "Солдатенков", "Солдатиков", "Солдаткин", "Солдатов", "Солдатченков", "Солеваров", "Соленков", "Соленов", "Соленый", "Солженицын", "Солин", "Соллертинский", "Соллогуб", "Солников", "Солнцев", "Солнышкин", "Солнышков", "Солобой", "Соловарь", "Соловей", "Соловейчик", "Соловейчиков", "Соловкин", "Соловов", "Соловухин", "Соловцов", "Соловьев", "Соловьян", "Сологуб", "Сологубов", "Солодар", "Солодкий", "Солодкин", "Солодков", "Солодов", "Солодовник", "Солодовников", "Солодун", "Солодухин", "Солодченко", "Солодягин", "Соломатин", "Соломатников", "Соломатов", "Соломаха", "Соломахин", "Соломеин", "Соломенников", "Соломенцев", "Соломин", "Соломка", "Соломко", "Соломоник", "Соломонов", "Соломончиков", "Соломяный", "Солонин", "Солонинин", "Солонинкин", "Солоницын", "Солонцов", "Солонченко", "Солоня", "Солоухин", "Солоха", "Солохин", "Солохов", "Солошенко", "Солошин", "Солощенко", "Соляков", "Соляник", "Солянкин", "Солянов", "Солярский", "Сомов", "Сонин", "Соничев", "Сопельников", "Сопиков(1)", "Сопиков(2)", "Сопилин", "Сопилкин", "Сопин", "Сопот", "Сопронов", "Сопрыкин", "Сопуляк", "Сопцов", "Сорогин", "Сорожкин", "Сорока", "Сорокин", "Сороковой", "Сороковский", "Сороковых", "Сорокопуд", "Сорокопудов", "Сорокоусов", "Сорочайкаин", "Сороченко", "Сорочкин", "Сосдекин", "Соседов", "Сосименко", "Сосин", "Сосипатров", "Соскин", "Сосков", "Соснин", "Соснихин", "Сосницкий", "Соснов", "Сосновский", "Сосова", "Соссиев", "Сосунов", "Сотенский", "Сотник", "Сотников", "Сотницкий", "Сотницын", "Сотский", "Сотсков", "Софенин", "Софийский", "Софоклов", "Софонов", "Софотеров", "Софроницкий", "Софронов", "Софронтьев", "Софьин", "Соха", "Сохарев", "Сохачев", "Сохин", "Сохраннов", "Соцкий", "Соцков", "Сочнев", "Сошников", "Спартанский", "Спасенникова", "Спасов", "Спасокукоцкий", "Спасский", "Сперанский", "Спешилов", "Спешнев", "Спивак", "Спиваков", "Спирев", "Спиридовский", "Спиридонов", "Спиридонский", "Спиридоньев", "Спиридошин", "Спирин", "Спиричкин", "Спирков", "Спирюхов", "Спиряев", "Спирякин", "Спиряков", "Спицин", "Спицын", "Спичак", "Спичаков", "Спичаковский", "Сплендоров", "Сплошнов", "Сплюхин", "Спорщиков", "Спорыхин", "Спорышев", "Способин", "Справец", "Спратанский", "Средин", "Среднев", "Срезнев", "Срезневский", "Сретенский", "Срубщиков", "Ставровский", "Ставропольцев", "Стадник", "Стадников", "Стаднюк", "Стаднюков", "Станиславов", "Станиславский", "Станищев", "Станкевич", "Станкевский", "Станкеев", "Станков", "Станчук", "Станько", "Станюкович", "Стариков", "Старицкий", "Старицын", "Старков", "Старов", "Старовайтов", "Староверов", "Старовойт", "Старовойтов", "Стародворский", "Стародворцев", "Стародубов", "Стародубцев", "Стародумов", "Старожилов", "Старозубов", "Старосельский", "Старосельцев", "Старухин", "Старцев", "Старченко", "Старченков", "Старыгин", "Старых", "Стасенко", "Стасий", "Стасов", "Стасяк", "Стафеев", "Стафейчук", "Стаханов", "Стахеев", "Стахиев", "Стахно", "Стахов", "Стаценко", "Сташевич", "Сташевский", "Сташенко", "Сташинин", "Сташков", "Стебаков", "Стеблев", "Стеблов", "Стегнеев", "Стеженский", "Стеллецкий", "Стенин", "Степак", "Степакин", "Степаков", "Степаненко", "Степаненков", "Степанец", "Степанин", "Степанищев", "Степанкин", "Степанов", "Степановский", "Степановской", "Степанцев", "Степанцов", "Степанченко", "Степанчиков", "Степанчук", "Степанычев", "Степанюк", "Степахин", "Степачев", "Степашин", "Степашкин", "Степин", "Степичев", "Степищев", "Степкин", "Степнов", "Степняков", "Степович", "Степук", "Степуков", "Степулин", "Степунин", "Степурин", "Степухин", "Степушин", "Степушкин", "Степчев", "Степченко", "Степченков", "Степчук", "Степыкин", "Степынин", "Степырев", "Степычев", "Стерлегов", "Стерлигов", "Стерлягов", "Стерхов", "Стефак", "Стефаненко", "Стефанкив", "Стефанов", "Стефанович", "Стефановский", "Стефашин", "Стефюк", "Стехин", "Стешенко", "Стирменов", "Стифеев", "Стобород", "Стогов", "Столбецов", "Столбихин", "Столбов", "Столетников", "Столетов", "Столечников", "Столешников", "Столыпин", "Стольников", "Столяренко", "Столяров", "Сторжниченко", "Сторожев", "Сторожевский", "Стороженко", "Сторожихин", "Сторожук", "Стоумов", "Стоюнин", "Стоянов", "Стравинский", "Страментов", "Страхов", "Страшинин", "Страшко", "Страшков", "Страшников", "Страшнов", "Страшун", "Стреаловских", "Стрекалин", "Стрекалов", "Стрекачев", "Стрекопытов", "Стрела", "Стрелавин", "Стрелец", "Стрелецкий", "Стрелин", "Стрелков", "Стрелов", "Стрельников", "Стрельцов", "Стрельченко", "Стрельчук", "Стрелюк", "Стреляев", "Стрепетилов", "Стрепетов", "Стрешнев", "Стрешников", "Стриганов", "Стригин", "Стрижаков", "Стрижев", "Стриженко", "Стрижков", "Строгальщиков", "Строганов", "Строгов", "Строгонов", "Строев", "Строителев", "Строкин", "Строков", "Струговщиков", "Струков", "Струнин", "Струнников", "Струнов", "Струняшев", "Струтинский", "Стручков", "Стрыгин", "Стрюков", "Стрюковатый", "Стрючков", "Стряпчий", "Студеникин", "Студенков", "Студенников", "Студенов", "Студинский", "Студяшев", "Стужин", "Стукалов", "Стулов", "Ступин", "Ступишин", "Ступников", "Стыров", "Стэфанов", "Стюхин", "Стюшин", "Суббота", "Субботин", "Суботин", "Суворин", "Суворов", "Судакевич", "Судаков", "Сударев", "Судариков", "Сударкин", "Сударушкин", "Судейкин", "Судейко", "Судейшин", "Судник", "Судников", "Судницын", "Судов", "Судовцев", "Судоплатов", "Судьбин", "Судьин", "Суетин", "Суетов", "Суздалов", "Суздальцев", "Сукач", "Сукачев", "Сукин", "Сукинов", "Сукманов", "Сукнов", "Сукновалов", "Суковатых", "Суконкин", "Суконников", "Сулейкин", "Сулейманов", "Сулейменов", "Сулиманов", "Султанов", "Султаншин", "Сульдин", "Сульженко", "Сумаков", "Сумарев", "Сумароков", "Сумец", "Сумин", "Сумкин", "Сумников", "Сумороков", "Сумороковский", "Сумочкин", "Сумский", "Сумцов", "Сундуков", "Сундучков", "Сунцев", "Сунцов", "Суперанский", "Супивник", "Супиченко", "Супранович", "Супротивин", "Супрун", "Супруненко", "Супрунец", "Супрунов", "Супрунчик", "Супрунюк", "Сургутский", "Сургутсков", "Суржиков", "Суриков", "Сурин", "Сурков", "Сурначев", "Сурнин", "Суров", "Суровцев", "Суровый", "Сусаев", "Сусайкин", "Сусайков", "Сусанин", "Сусанов", "Сусарин", "Сусеев", "Сусликов", "Суслов", "Суслопаров", "Сутормин", "Сутоцкий", "Сутырин", "Сутягин", "Суханкин", "Суханов", "Сухарев", "Сухарин", "Сухарников", "Сухарышев", "Сухач", "Сухенко", "Сухинин", "Сухинов", "Сухирин", "Сухих", "Сухнат", "Сухобоков", "Сухов", "Суховрин", "Сухогрузов", "Сухогузов", "Суходольский", "Сухой", "Сухомлин", "Сухомлинов", "Сухомлинский", "Сухонин", "Сухоногов", "Сухоносик", "Сухоносов", "Сухонырин", "Сухопаров", "Сухоплясов", "Сухоребров", "Сухоребрый", "Сухоруких", "Сухоруков", "Сухоручко", "Сухотин", "Сухоткин", "Сухотников", "Сухушин", "Сучков", "Сушилин", "Сушилов", "Сушильщиков", "Сушков", "Сушняков", "Сушов", "Сущев", "Сущиков", "Счетчиков", "Сывороткин", "Сызранкин", "Сызранцев", "Сыкчин", "Сырейщиков", "Сырков", "Сыров", "Сыроваров", "Сыроделов", "Сыродубов", "Сыроежкин", "Сыромолотов", "Сыромятников", "Сыропоршнев", "Сыропятов", "Сырорыбов", "Сырчетов", "Сысаев", "Сысин", "Сысоев", "Сысолетин", "Сысольцев", "Сысолятин", "Сысуев", "Сытин", "Сычев", "Сычков", "Сычов", "Сьянов", "Сюзев", "Сюртуков", "Сябрин", "", "Табаков", "Табачник", "Табачников", "Табашников", "Таболин", "Таболкин", "Табунщиков", "Таволжанский", "Таганов", "Таганцев", "Тагашев", "Тагашов", "Тагильцев", "Тагиров", "Таиров", "Таищев", "Такмаков", "Талабанов", "Талаболин", "Талагаев", "Талаев", "Талалаев", "Талалакин", "Талалахин", "Талалихин", "Талалыкин", "Таланин", "Таланкин", "Таланов", "Талантов", "Талашин", "Талдонин", "Талдыкин", "Талимонов", "Талипов", "Талицкий", "Таловеров", "Талызин", "Талыпов", "Тамарин", "Тамаров", "Тамаровский", "Тамашевский", "Тамбовцев", "Тамгин", "Танаевский", "Танаисов", "Танасийчук", "Танасьев", "Танасюк", "Танеев", "Танин", "Танич", "Таничев", "Таныгин", "Тапешкин", "Тарабаев", "Тарабанов", "Тарабарин", "Тарабаров", "Тарабрин", "Тарабукин", "Тарабуткин", "Тарабыкин", "Тарабычин", "Тараканов", "Таракин", "Таран", "Тараненко", "Тараник", "Таранин", "Таранов", "Тарановский", "Тарантасов", "Тарантов", "Тарараев", "Тарараин", "Тараруев", "Тараруй", "Тарарукин", "Тарарусин", "Тарарыкин", "Тарарышкин", "Тарасевич", "Тарасенко", "Тарасенков", "Тарасенок", "Тарасеня", "Тарасик", "Тарасиков", "Тараскин", "Тарасов", "Тарасовец", "Тарасьев", "Тарасюк", "Тараторин", "Тараторкин", "Тарахов", "Тарашкин", "Тарновский", "Тарских", "Тартаков", "Тартаковский", "Тартачев", "Тарусин", "Тарутин", "Тарханов", "Тархов", "Тассов", "Татакин", "Татарин", "Татаринов", "Татаринцев", "Татаркин", "Татарников", "Татаров", "Татарович", "Татауров", "Татищев", "Татушин", "Татьянин", "Татьянич", "Татьяничев", "Татьянищев", "Татьянкин", "Таусенев", "Тахистов", "Тахтамыш", "Ташлинцев", "Твардовский", "Твердашов", "Твердиков", "Твердилов", "Твердиславлев", "Твердиславов", "Твердобрюхов", "Твердов", "Твердомедов", "Твердоногов", "Твердоумов", "Твердохлеб", "Твердохлебов", "Твердун", "Твердышев", "Твердюков", "Тверетников", "Тверитин", "Тверитин(ов)", "Тверитинов", "Тверских", "Тверской", "Тверяков", "Тверянкин", "Тверянов", "Творилов", "Творогов", "Творожников", "Тебеньков", "Тезавровскии", "Тезавровский", "Тейковцев", "Теймуразов", "Тектонов", "Телегин", "Тележкин", "Телелюев", "Телемаков", "Теленкевич", "Теленков", "Теленченко", "Телепнев", "Телескопов", "Телеш", "Телешев", "Телешенко", "Телешов", "Телимонов", "Теличкин", "Телкин", "Телков", "Телушкин", "Тельнов", "Тельных", "Тельпугов", "Телюков", "Теляков", "Телятев", "Телятевский", "Телятников", "Телятьев", "Теляшин", "Темирбулатов", "Темирев", "Темирканов", "Темиров", "Темирханов", "Темирязев", "Темляков", "Темников", "Темнов", "Темный", "Темных", "Темняев", "Темяков", "Тендряков", "Теплинский", "Теплицкий", "Теплов", "Теплухин", "Теплый", "Теплых", "Тепляев", "Тепляков", "Тептин", "Тептяев", "Тепцов", "ТерЯхин", "ТерЯшин", "ТерЯшкин", "Теренин", "Терентьев", "Тереханов", "Терехин", "Терехов", "Тереховский", "Терешин", "Терешкин", "Терешко", "Терешков", "Терешонок", "Терещенко", "Терещук", "Терихов", "Теркин", "Терновский", "Терский", "Терюхов", "Терюшин", "Тесаков", "Тестин", "Тестов", "Тестоедов", "Тетерев", "Тетеревков", "Тетеревлев", "Тетерин", "Тетерич", "Тетеркин", "Тетерук", "Тетерятников", "Тетивкин", "Тешин", "Тивунов", "Тикшаев", "Тиличеев", "Тимакин", "Тимаков", "Тиманин", "Тиманов", "Тимахин", "Тимачев", "Тимашев", "Тимашов", "Тимашук", "Тименков", "Тимешов", "Тимин", "Тимирев", "Тимирязев", "Тимкин", "Тимко", "Тимков", "Тимковский", "Тиможенко", "Тимонаев", "Тимонин", "Тимосин", "Тимофеев", "Тимофеенко", "Тимофеичев", "Тимохин", "Тимохов", "Тимочкин", "Тимошев", "Тимошевич", "Тимошевская", "Лариса", "Тимошенко", "Тимошенков", "Тимошин", "Тимошкин", "Тимошков", "Тимощенко", "Тимощук", "Тимуев", "Тимунин", "Тимуров", "Тимушев", "Тимушкин", "Тимченко", "Тимчинко", "Тимшин", "Тимяшев", "Тинаев", "Тингаев", "Тингайкин", "Тинговатов", "Тинин", "Тиньков", "Типикин", "Тираспольский", "Тиронов", "Титаев", "Титарев", "Титаренко", "Титарчук", "Титкин", "Титков", "Титов", "Титовец", "Титухин", "Тиунов", "Тиханин", "Тиханов", "Тихвинский", "Тихвинцев", "Тихий", "Тихиков", "Тихменев", "Тихов", "Тиходеев", "Тихой", "Тихомиров", "Тихоненко", "Тихонов", "Тихонравов", "Тихонычев", "Тихонюк", "Тихоход", "Тихоходов", "Тишаков", "Тишеев", "Тишенин", "Тишенков", "Тишенников", "Тишечкин", "Тишин", "Тишкевич", "Тишкин", "Тишков", "Тишуткин", "Тищенко", "Ткалич", "Ткач", "Ткачев", "Ткаченко", "Ткачук", "Тлустовский", "Тоболкин", "Тоболов", "Тобольчанин", "Тобуркин", "Товкун", "Товстоногов", "Тодаев", "Тодоров", "Тодорский", "Токарев", "Токарь", "Токмаков", "Токмачов", "Токуев", "Толбузин", "Толбухин", "Толкачев", "Толков", "Толкунов", "Толмазов", "Толмасов", "Толмачев", "Толмачов", "Толокнов", "Толоков", "Толоконников", "Толопеев", "Толпегин", "Толпежников", "Толпыгин", "Толстиков", "Толстобоков", "Толстобров", "Толстобровый", "Толстов", "Толстогузов", "Толстодомов", "Толстожиров", "Толстой", "Толстокулаков", "Толстолыткин", "Толстоног", "Толстоногов", "Толстоносов", "Толстопалов", "Толстопальцев", "Толстопятов", "Толстоусов", "Толстоухов", "Толстошеин", "Толстухин", "Толстых", "Толстяков", "Толубеев", "Толупеев", "Толупьев", "Толчельников", "Толченников", "Томарев", "Томаров", "Томашевич", "Томашевский", "Томашков", "Томашов", "Томилев", "Томилин", "Томилов", "Томин", "Томчук", "Тонев", "Тонеев", "Тонкачев", "Тонкий", "Тонкин", "Тонких", "Тонков", "Тонконогих", "Тонконогов", "Тонкошеев", "Тонкошкуров", "Тонкушин", "Тончиков", "Топазов", "Тополев", "Топориков", "Топорищев", "Топорков", "Топоров", "Топтыгин", "Топчанов", "Топчий", "Топчилов", "Торбеев", "Торбин", "Торгашин", "Торговкин", "Торжков", "Торицын", "Торлопов", "Тормазов", "Тормасов", "Тормозов", "Торопов", "Торопцев", "Торопчанин", "Торопыгин", "Торочешников", "Торсуков", "Тортунов", "Торутин", "Тотемин", "Тотменин", "Тотьмянин", "Тохтамыш", "Точилин", "Точилкин", "Тощаков", "Трава", "Травин", "Травинин", "Травинский", "Травкин", "Травкинский", "Травников", "Транквилицкий", "Трапезников", "Трафандилов", "Трахименок", "Тревогин", "Трегуб", "Трегуб(ов)", "Трегубенко", "Трегубов", "Трезвинский", "Тремаскин", "Тремасов", "Тремполец", "Тренев", "Тренин", "Трепаленков", "Трепалин", "Трепачев", "Трепашев", "Трепашкин", "Трепетов", "Трепов", "Третилов", "Третников", "Третьяк", "Третьякевич", "Третьяков", "Третьячков", "Третюхин", "Третяк", "Треухов", "Треушкин", "Треушков", "Трефилов", "Трефолев", "Трефольев", "Трехденнов", "Трехлетов", "Трехшубин", "Трешков", "Трешников", "Тригорлов", "Тригоров", "Тригорьев", "Тригуб", "Тригубенко", "Тригубец", "Трикур", "Тримайлов", "Тринитатин", "Триодин", "Трипалин", "Трипольский", "Трисвятский", "Трисвяцкий", "Тритяков", "Трифакин", "Трифанов", "Трифенин", "Трифилов", "Трифин", "Трифонов", "Трихин", "Трихинский", "Тришечкин", "Тришин", "Тришкин", "Трищ", "Трищенков", "Троегубов", "Троекашин", "Троекуров", "Троепольский", "Троицкий", "Троицкой", "Троицын", "Тройнин", "Тронин", "Троняев", "Тропарев", "Тропин", "Трофименко", "Трофимов", "Трофимук", "Трофимчук", "Трохачев", "Трохименко", "Трохин", "Троценко", "Троцко", "Трошев", "Трошин", "Трошкин", "Трошко", "Трощак", "Трощенко", "Трояков", "Троян", "Троянов", "Троянский", "Троянский(1)", "Троянский(2)", "Труба", "Трубачев", "Трубецкой", "Трубилин", "Трубин", "Трубихин", "Трубицин", "Трубицын", "Трубкин", "Трубников", "Труд", "Трудягин", "Тружеников", "Трундин", "Трунехин", "Трунин", "Трунков", "Трунов", "Труняев", "Труняков", "Трусаков", "Трусимов", "Трусихин", "Трусков", "Трусов", "Трутнев", "Труфанов", "Труханов", "Трухановский", "Трухачев", "Трухин", "Трухинов", "Трухманов", "Труш", "Трушенко", "Трушенков", "Трушенский", "Трушик", "Трушин", "Трушицын", "Трушкин", "Трушков", "Трыков", "Трындин", "Тряпкин", "Трясогузов", "Туберозов", "Тувыкин", "Туганов", "Тугаринов", "Туголуков", "Туесов", "Тужилин", "Тужилкин", "Тужилов", "Туз", "Тузлуков", "Тузов", "Тузулуков", "Туисов", "Тукалин", "Туктамышев", "Туликов", "Тулов", "Тулубеев", "Тулумбасов", "Тулупов", "Тулупьев", "Тульчинский", "Туляков", "Тумаков", "Туманик", "Туманин", "Туманкин", "Туманков", "Туманов", "Туманский", "Тумаркин", "Туменев", "Туменов", "Тунгусов", "Туников", "Тунин", "Тунников", "Тупикин", "Тупиков", "Тупицин", "Тупицын", "Тупомордов", "Тупоногов", "Тупорылов", "Тур", "Тураев", "Турандин", "Турбин", "Тургенев", "Тургуненков", "Туренин", "Туренко", "Турецкий", "Туриков", "Турин", "Туринов", "Турищев", "Туркевич", "Туркенин", "Туркенич", "Туркин", "Турко", "Турков", "Турковский", "Турманов", "Туробеев", "Туробов", "Туров", "Туровец", "Туровецкий", "Туровский", "Турский", "Турчанин", "Турчанинов", "Турченинов", "Турченков", "Турчин", "Турчинов", "Туряк", "Турянский", "Тутов", "Туторский", "Тутунников", "Тухачевский", "Тухтамышев", "Туча", "Тучин", "Тучков", "Тучнолобов", "Тушев", "Тушин", "Тушнов", "Тушов", "Туясов", "Тчанников", "Тыквин", "Тырин", "Тыркалов", "Тырков", "Тырон", "Тыронов", "Тыртов", "Тыртыгин", "Тырышкин", "Тысячнов", "Тычина", "Тычинин", "Тычинский", "Тыщенко", "Тыщук", "Тюлеев", "Тюленев", "Тюленин", "Тюленков", "Тюлечкин", "Тюлешов", "Тюлин", "Тюльканов", "Тюлькин", "Тюльков", "Тюльпанов", "Тюльпин", "Тюлюкин", "Тюмелев", "Тюменев", "Тюменцев", "Тюников", "Тюнин", "Тюнькин", "Тюпин", "Тюрев", "Тюренков", "Тюриков", "Тюрин", "Тюряков", "Тютиков", "Тютчев", "Тютюнников", "Тютюнов", "Тюфякин", "Тюфяков", "Тюхтин", "Тябликов", "Тяблов", "Тягин", "Тяглов", "Тяглый", "Тягунов", "Тягущев", "Тяжелкин", "Тяжелов", "Тяжкий", "Тяжких", "Тяжков", "Тяжов", "Тяпин", "Тяпкин", "Тяпунов", "Тяпушкин", "Тятечкин", "Тятин", "Тятькин", "Тятюхин", "Тятянин", "", "Уаров", "Убайдуллаев", "Убегайлов", "Убейсобакин", "Убийвовк", "Увакин", "Увалень", "Уварин", "Уваркин", "Уваров", "Увечнов", "Увин", "Угаров", "Угланов", "Углев", "Углов", "Угодников", "Угольников", "Угорич", "Угреев", "Угренинов", "Угримов", "Угринов", "Угрюмов", "Удавихин", "Удалов", "Удахин", "Удачев", "Удимов", "Удинцев", "Удобин", "Удобнов", "Удовенко", "Удовиченко", "Удод", "Удодов", "Уемлянин", "Узбеков", "Уздечкин", "Узелков", "Узкий", "Узков", "Узлов", "Уймин", "Уклейкин", "Уколов", "Украинский", "Украинцев", "Уксусников", "Уксусов", "Улагашов", "Уланов", "Уласов", "Уледов", "Улисов", "Улиссов", "Улитин", "Улитчев", "Улогов", "Улыбаев", "Улыбашев", "Улыбин", "Улыбышев", "Ульев", "Ульченко", "Ульянец", "Ульянин", "Ульяница", "Ульяничев", "Ульянищев", "Ульянкин", "Ульянов", "Ульяновский", "Ульянчев", "Ульянчик", "Ульяхин", "Ульяшин", "Ульяшков", "Ульяшов", "Уляхин", "Уманский", "Уманцев", "Умаров", "Умиров", "Умнов", "Умнягин", "Умов", "Умрихин", "Умянцев", "Умянцов", "Ундаков", "Унесигоре", "Унжаков", "Униров", "Упадышев", "Упатов", "Упатчев", "Упин", "Упиров", "Уполовников", "Упоров", "Упырин", "Уразаев", "Уразманов", "Уразов", "Ураков", "Уралов", "Уральский", "Уральских", "Ураниев", "Уранов", "Ураносов", "Урбанов", "Урбанович", "Урбанский", "Урванин", "Урванов", "Урванцев", "Урванцов", "Урецкий", "Уржумов", "Уржумцев", "Урин", "Урицкий", "Урманов", "Урманцев", "Урманцов", "Урсул", "Урсулов", "Урусбиев", "Урусов", "Урываев", "Урьев", "Урюмцев", "Урюпа", "Урюпин", "Урядкин", "Урядников", "Урядов", "Ус", "Усанов", "Усастов", "Усатов", "Усатых", "Усатюк", "Усачев", "Усеинов", "Усейнов", "Усенко", "Усенков", "Усердов", "Усик", "Усиков", "Усин", "Усищев", "Усков", "Усманов", "Усов", "Усольцев", "Успенский", "Усс", "Уссаковский", "Устенко", "Устименко", "Устимов", "Устимович", "Устимчук", "Устиников", "Устинкин", "Устинников", "Устинов", "Устич", "Устьянов", "Устьянцев", "Устюгов", "Устюжанин", "Устюжанинов", "Устюжанов", "Устюженин", "Устюжников", "Устюхин", "Устюшин", "Устюшкин", "Утенков", "Утенов", "Утехин", "Утешев", "Утин", "Уткин", "Утляков", "Утолин", "Уточкин", "Утробин", "Уфа", "Уфимский", "Уфимцев", "Ухалин", "Уханов", "Ухов", "Ухтомский", "Учватов", "Учеватов", "Учуватов", "Ушак", "Ушаков", "Ушанев", "Ушанов", "Ушаткин", "Ушатов", "Ушатый", "Ушенин", "Ушинский", "Ушкалов", "Ушко", "Ушков", "Ушколов", "Ущекин", "Уяздовский", "", "", "", "Фабиш", "Фабрикант", "Фабрикантов", "Фабричнов", "Фабричный", "Фаворский", "Фавсткин", "Фавстов", "Фадеев", "Фадеенко", "Фадеинов", "Фадеичев", "Фадейкин", "Фадейчев", "Фадин", "Фадюшин", "Фазилов", "Фазылов", "Файбисевич", "Файбисович", "Файбишевский", "Файбишенко", "Файбус", "Файбусович", "Файвель", "Файвилевич", "Файвиш", "Файвишевич", "Файвус", "Файзулин", "Файзуллин", "Фактор", "Факторович", "Фалаев", "Фалалеев", "Фаламеев", "Фалев", "Фалеев", "Фалелеев", "Фалелиев", "Фалилеев", "Фалин", "Фалов", "Фалугин", "Фалунин", "Фалько", "Фальков", "Фальковский", "Фалюшин", "Фаляндин", "Фаминицын", "Фаминцын", "Фандеев", "Фандиков", "Фандюшин", "Фараонов", "Фарапонов", "Фарафонов", "Фарафонтов", "Фарафонтьев", "Фарбей", "Фарбер", "Фарберов", "Фаресов", "Фаркин", "Фарколин", "Фармаковский", "Фарфоровский", "Фасин", "Фасолов", "Фасонов", "Фасткин", "Фастов", "Фатеев", "Фатиев", "Фатин", "Фаткин", "Фатнев", "Фатов", "Фатьянов", "Фаустов", "Фебов", "Февронин", "Феденев", "Феденко", "Феденков", "Федерякин", "Федешов", "Федиков", "Федин", "Фединин", "Федирко", "Федичкин", "Федищев", "Федков", "Феднев", "Федонин", "Федорахин", "Федореев", "Федоренко", "Федоренков", "Федорец", "Федорив", "Федорин", "Федоринин", "Федоринов", "Федоринцев", "Федоринчик", "Федоришин", "Федорищев", "Федоркевич", "Федорков", "Федоров", "Федорович", "Федоровский", "Федоровских", "Федоровцев", "Федоровых", "Федорозюк", "Федоросюк", "Федорук", "Федорушков", "Федорцов", "Федорченко", "Федорчук", "Федоряк", "Федоряка", "Федорякин", "Федосеев", "Федосенко", "Федосин", "Федосов", "Федосьев", "Федосюк", "Федотихин", "Федоткин", "Федотов", "Федотовский", "Федотовских", "Федотчев", "Федотычев", "Федотьев", "Федулаев", "Федулеев", "Федулин", "Федулов", "Федульев", "Федунов", "Федурко", "Федутинов", "Федченко", "Федченков", "Федченок", "Федчин", "Федчищев", "Федчун", "Федыкин", "Федына", "Федышин", "Федькив", "Федькин", "Федько", "Федьков", "Федькунов", "Федюкевич", "Федюкин", "Федюков", "Федюнин", "Федюнкин", "Федюнов", "Федюхин", "Федюшин", "Федюшкин", "Федягин", "Федяев", "Федяинов", "Федякин", "Федяков", "Федянин", "Федяхин", "Федяченко", "Федяшин", "Федяшкин", "Фейбель", "Фейбуш", "Фейвель", "Феклин", "Феклинов", "Феклистов", "Фелахов", "Фелицын", "Фелякин", "Фенев", "Фененко", "Фенин", "Феничев", "Феногенов", "Феноменов", "Фенюк", "Фенютин", "Фенюшкин", "Феодоров", "Феодосьев", "Феоклистов", "Феоктистов", "Феонин", "Феофанин", "Феофанкин", "Феофанов", "Феофантьев", "Феофелактов", "Феофелатов", "Феофилактов", "Феофилатов", "Феофилов", "Ферамонтов", "Ферапонтов", "Ферапонтьев", "Фербер", "Ферберов", "Фермов", "Фертов", "Фесенко", "Фесик", "Фескин", "Фессалоницкий", "Фесько", "Фетисов", "Фефелин", "Фефелов", "Фефилатьев", "Фефилин", "Фефилов", "Фещук", "Фещуков", "Фиалков", "Фиалковский", "Фивейский", "Фигурнов", "Фигуровский", "Фиделин", "Филадельфов", "Филаретов", "Филасов", "Филаткин", "Филатов", "Филатьев", "Филахов", "Филахтов", "Филев", "Филилеев", "Филимоненко", "Филимонихин", "Филимонов", "Филимохин", "Филимошин", "Филин", "Филинков", "Филинов", "Филинцев", "Филипенко", "Филипенков", "Филипков", "Филипов", "Филипович", "Филипп", "Филиппенков", "Филиппов", "Филиппович", "Филипповский", "Филиппчиков", "Филиппьев", "Филипских", "Филипушкин", "Филипцев", "Филипченко", "Филипчик", "Филипчиков", "Филипчук", "Филипьев", "Филисов", "Филичев", "Филиченко", "Филичкин", "Филков", "Филлипов", "Филов", "Филологов", "Филоматитский", "Филомафитский", "Филоненко", "Филонин", "Филонов", "Филончик", "Философов", "Филохов", "Филчев", "Филь", "Филькин", "Фильков", "Фильчагин", "Фильчаков", "Фильченко", "Фильченков", "Фильшин", "Филюев", "Филюк", "Филюков", "Филюнин", "Филютич", "Филютович", "Филюхин", "Филюшин", "Филюшкин", "Филяев", "Филяк", "Филякин", "Филяков", "Филялин", "Филяшин", "Фимин", "Фимичев", "Фимкин", "Финагенов", "Финагин", "Финадеев", "Финаев", "Финажин", "Финакин", "Финашкин", "Финеев", "Финогеев", "Финогенов", "Финютин", "Финягин", "Финяев", "Фионин", "Фионов", "Фиохин", "Фиошин", "Фиошкин", "Фиронов", "Фирсаев", "Фирсанин", "Фирсанов", "Фирсов", "Фирюбин", "Фирюлин", "Фиш", "Фишевский", "Фишелев", "Фишель", "Фишер", "Фишерович", "Фишин", "Фишкин", "Фишков", "Флавицкий", "Флеганов", "Флегантов", "Флегентов", "Флегонов", "Флегонтев", "Флегонтов", "Флегонтьев", "Флерко", "Флеров", "Флоранский", "Флоренский", "Флорентьев", "Флоридов", "Флорин", "Флоринский", "Флоров", "Флоровский", "Флягин", "Фойницкий", "Фоканов", "Фокапов", "Фокеев", "Фокин", "Фокинов", "Фоков", "Фолин", "Фолков", "Фоломеев", "Фоломешкин", "Фоломин", "Фоломкин", "Фолонин", "Фольшин", "Фомагин", "Фоменко", "Фоменков", "Фоменок", "Фомин", "Фоминков", "Фоминов", "Фоминцев", "Фоминых", "Фомич", "Фомичев", "Фомиченко", "Фомичкин", "Фомкин", "Фомов", "Фомочкин", "Фомушкин", "Фомченко", "Фомягин", "Фонаков", "Фонвизин", "Фонин", "Фонинский", "Фонякин", "Фоняков", "Форманюк", "Формозов", "Форопанов", "Форопонтов", "Фортов", "Фортунато", "Фортунатов", "Фортунатто", "Фостиков", "Фотеев", "Фотиев", "Фотик", "Фотин", "Фотов", "Фотьев", "Фофанов", "Фофонов", "Фоченков", "Фрадин", "Фрадис", "Фрадкин", "Фрадлин", "Франк", "Франковский", "Франтов", "Франц", "Францев", "Французенок", "Французов", "Франченко", "Франченок", "Фраткин", "Фрейдин", "Фрейдкин", "Фрейдлин", "Фролкин", "Фролков", "Фролов", "Фроловский", "Фроловских", "Фролочкин", "Фронтасьев", "Фросин", "Фрудис", "Фруентов", "Фрумин", "Фрумкин", "Фрумкис", "Фрумсон", "Фрунзе", "Фрязинов", "Фряков", "Фундуклеев", "Фураев", "Фурасьев", "Фурзиков", "Фурин", "Фурман", "Фурманов", "Фурманюк", "Фурсаев", "Фурсанов", "Фурсенко", "Фурсин", "Фурсов", "Фурцев", "Фусиков", "Фуфаев", "Фуфайкин", "Фуфлыгин", "Фыров", "", "Хабалов", "Хабаров", "Хабибулин", "Хабибуллин", "Хавин", "Хавкин", "Хавроньин", "Хаврошин", "Хаврунов", "Хаврюхин", "Хаврюшин", "Хадеев", "Хаджаев", "Хаджиев", "Хаджинов", "Хает", "Хазан", "Хазанов", "Хазанович", "Хазановский", "Хазов", "Хаимов", "Хаин", "Хаит", "Хайдуков", "Хайкес", "Хайкин", "Хаймин", "Хайт", "Хайтович", "Хакаскин", "Хакимов", "Халалеев", "Халдеев", "Халтурин", "Халупович", "Халютин", "Халявин", "Хаментов", "Хамовников", "Ханаев", "Хандошкин", "Ханжин", "Ханин", "Ханкин", "Ханов", "Ханыгин", "Ханыков", "Ханюков", "Хаперсков", "Хапугин", "Харатьян", "Харатьянов", "Харахордин", "Харенко", "Харин", "Харинов", "Харисов", "Харитов", "Харитонов", "Харитончюк", "Хариточенко", "Харитошин", "Харичкин", "Харичков", "Харламов", "Харлампиев", "Харланов", "Харлапин", "Харлачов", "Харлашев", "Харлашин", "Харлашкин", "Харлов", "Харчев", "Харченко", "Харчиков", "Харчистов", "Харчук", "Харькин", "Харьков", "Харюков", "Хасанов", "Хасид", "Хатин", "Хатунцев", "Хатьянов", "Хатюшин", "Хаустов", "Хахалин", "Хахамович", "Хацкелев", "Хвастов", "Хвастунов", "Хвастушин", "Хватов", "Хвилин", "Хволес", "Хвольсон", "Хворов", "Хворостинин", "Хворостков", "Хворостов", "Хвостиков", "Хвостов", "Хвостунов", "Хвощев", "Хейфец", "Хенин", "Хенкин", "Херасков", "Хетагуров", "Хижняк", "Хижняков", "Хизин", "Хилин", "Хилиниченко", "Хилков", "Хилчевский", "Химатуллин", "Химин", "Химинец", "Химичев", "Химкин", "Химушкин", "Хирин", "Хирьяков", "Хисматов", "Хисматуллин", "Хитин", "Хитров", "Хитрово", "Хитулин", "Хлабыстов", "Хлапов", "Хлебников", "Хлебодаров", "Хлобыстов", "Хлопин", "Хлопкин", "Хлопко", "Хлопков", "Хлопов", "Хлопушин", "Хлудев", "Хлудов", "Хлузов", "Хлусов", "Хлустов", "Хлынин", "Хлынов", "Хлыстун", "Хлыстунов", "Хлюпин", "Хлюстин", "Хлюстов", "Хмелев", "Хмель", "Хмельницкий", "Хмелюк", "Хмилевский", "Хмылев", "Хмырев", "Хмырин", "Хмыров", "Хованский", "Ховрашов", "Ховреин", "Ховрин", "Ховроньин", "Ходак", "Ходаков", "Ходаковский", "Ходарев", "Ходарин", "Ходасевич", "Ходатаев", "Ходеев", "Ходжаев", "Ходкевич", "Ходоков", "Ходоров", "Ходосов", "Ходотов", "Ходунов", "Ходыкин", "Ходырев", "Ходыревский", "Хозин", "Хозицкий", "Хозяинов", "Холдеев", "Холзаков", "Холзин", "Холин", "Холкин", "Холмогоров", "Холмский", "Холодарь", "Холоденко", "Холодильников", "Холодников", "Холодный", "Холодов", "Холомеев", "Холомин", "Холонин", "Холопов", "Холостяков", "Холтурин", "Холуев", "Холуйников", "Холунников", "Холустин", "Холшевников", "Холщевников", "Хользунов", "Холявин", "Хоменко", "Хоменков", "Хомин", "Хомишин", "Хомуткин", "Хомутников", "Хомутов", "Хомченко", "Хомчук", "Хомяк", "Хомяков", "Хоненев", "Хонин", "Хонинов", "Хонкин", "Хонякин", "Хоперский", "Хопренинов", "Хорин", "Хоробитов", "Хоробов", "Хоробритов", "Хоробров", "Хорохорин", "Хорош", "Хорошавин", "Хорошев", "Хорошилов", "Хороших", "Хорошихин", "Хорошкин", "Хорошко", "Хорошулин", "Хорошунов", "Хорошухин", "Хортов", "Хоруженко", "Хорунжий", "Хорхорин", "Хорькин", "Хорьков", "Хотегов", "Хотеев", "Хотенов", "Хотлинцев", "Хотулев", "Хотунский", "Хотунцев", "Хотынцев", "Хотькевич", "Хотьков", "Хотяев", "Хотяин", "Хотяинцев", "Хохланов", "Хохлатов", "Хохлачев", "Хохлеев", "Хохленков", "Хохлин", "Хохлов", "Хохов", "Хохолев", "Хохолешников", "Хохолков", "Хохрин", "Хохряков", "Хохулин", "Храбров", "Храбрых", "Храмичев", "Храмов", "Храмцов", "Храпачев", "Храпков", "Храпов", "Храповицкий", "Храпунов", "Хренников", "Хренов", "Хрипко", "Хрипунов", "Хрисанфов", "Хрисогонов", "Христианов", "Христиановский", "Христин", "Христинин", "Христов", "Христолюбов", "Христолюбский", "Христофоров", "Христюхин", "Хромец", "Хромов", "Хромцов", "Хромых", "Хрулев", "Хрунин", "Хруницкий", "Хруничев", "Хрунов", "Хрусталев", "Хрустов", "Хрушкий", "Хрущев", "Хрущов", "Хрюкалов", "Хрюкин", "Хрюнин", "Хряков", "Хрястов", "Хрящев", "Хрящиков", "Худаков", "Худанин", "Худанов", "Худик", "Худобашев", "Худобин", "Художилов", "Художник", "Худоногов", "Худорбиев", "Худорожков", "Худошин", "Худяк", "Худяков", "Хурамов", "Хуртин", "Хусаинов", "Хусейнов", "Хусид", "Хусит", "Хуторовский", "Хухорев", "Хухоров", "Хухриков", "Хухрыгин", "Хухряков", "", "Цагараев", "Цап", "Цапакин", "Цапенко", "Цаплин", "Цапурин", "Цапыгин", "Царапкин", "Царев", "Царевитинов", "Царегородский", "Царегородцев", "Цареградский", "Царенко", "Царетинов", "Царицын", "Царский", "Царственый", "Царьков", "Царюк", "Цветаев", "Цветков", "Цветковский", "Цветнов", "Цветов", "Цветухин", "Цвилев", "Цвиленев", "Цвирко", "Цвиркун", "Цвылев", "Цегельник", "Целебровский", "Целиков", "Целиковский", "Целищев", "Целовальников", "Целоусов", "Цемнолонский", "Цемнолуский", "Цемнолуцкий", "Цепакин", "Цепов", "Церевитинов", "Церенов", "Церенчиков", "Церенщиков", "Церерин", "Церковер", "Церовитинов", "Цехмистров", "Цецера", "Цецерко", "Цецеро", "Цибесов", "Цибизов", "Цибрин", "Цибулька", "Цибулькин", "Цибуля", "Цивилев", "Цивильский", "Цигельников", "Цигенбаум", "Цикенонпасер", "Циконицкий", "Цикурис", "Цимашук", "Цимбиди", "Цимко", "Цимлянсков", "Цинговатов", "Циолковский", "Ционглинский", "Ципин", "Ципкин", "Цирихов", "Циркунов", "Цируль", "Цитович", "Цитронблат", "Цопов", "Цубатов", "Цуканов", "Цукерник", "Цуриков", "Цуцков", "Цыбанин", "Цыбасов", "Цыбиков", "Цыбин", "Цыбкльский", "Цыборов", "Цыбрин", "Цыбуленко", "Цыбулька", "Цыбулькин", "Цыбуля", "Цыбыляев", "Цыверов", "Цыганенко", "Цыганкин", "Цыганков", "Цыганов", "Цыганчук", "Цыгарев", "Цызыров", "Цымбалист", "Цымбалюк", "Цымлянсков", "Цыпельников", "Цыперович", "Цыперсон", "Цыпин", "Цыпкин", "Цыплаков", "Цыпленков", "Цыпляков", "Цыплятев", "Цыплятьев", "Цыпов", "Цыренов", "Цырулик", "Цыруль", "Цырульников", "Цырюльников", "Цысырев", "Цыферов", "Цыцарев", "Цыцын", "Цьплаков", "Цьпленков", "Цьпляков", "Цьплятев", "Цюпа", "", "Чаадаев", "Чабанов", "Чабров", "Чавкин", "Чавуский", "Чагадаев", "Чагин", "Чагочкин", "Чадаев", "Чадов", "Чажегов", "Чазов", "Чайка", "Чайкин", "Чайковский", "Чакалов", "Чалдонов", "Чалеев", "Чалмаев", "Чалов", "Чалый", "Чалых", "Чамин", "Чамкин", "Чамов", "Чанов", "Чапаев", "Чапайкин", "Чапкин", "Чаплин", "Чаплыгин", "Чапурин", "Чапыгин", "Чаркин", "Чародеев", "Чаромский", "Чарошников", "Чарушин", "Чарушкин", "Чарушников", "Чарыков", "Часовитин", "Часовников", "Часоводов", "Часовщиков", "Частиков", "Частов", "Частухин", "Чауский", "Чаусский", "Чашин", "Чашкин", "Чашков", "Чашников", "Чащин", "Чащихин", "Чаянов", "Чванов", "Чвирев", "Чвырев", "Чебаков", "Чеберев", "Чеборахин", "Чеботаев", "Чеботарев", "Чеботин", "Чеботков", "Чеботов", "Чебурахин", "Чебурашкин", "Чебурков", "Чебыкин", "Чеверов", "Чевкин", "Чевыкин", "Чеглаков", "Чеглов", "Чеглоков", "Чегломов", "Чегодаев", "Чекалин", "Чекалкин", "Чекалов", "Чекаль", "Чекан", "Чеканов", "Чекановский", "Чекмарев", "Чекмасов", "Чекменев", "Чекменцев", "Чекомасов", "Чекрыжов", "Чекулаева", "Чекушин", "Чекушкин", "Чекшин", "Челдонов", "Челищев", "Челноков", "Челогузов", "Челпанов", "Челышев", "Челюканов", "Челюскин", "Челюсткин", "Чемадуров", "Чембарцев", "Чемезов", "Чемесов", "Чемоданов", "Чемодуров", "Ченцов", "Чеодаев", "Чепайкин", "Чепелев", "Чепеленко", "Чепоров", "Чепраков", "Чепурнов", "Чепурной", "Черанев", "Червяков", "Чердынин", "Чердынцев", "Черевиков", "Чередников", "Черемин", "Черемисин", "Черемискин", "Черемисов", "Черемнов", "Черемных", "Черемшанский", "Черенков", "Черенов", "Черепанов", "Черепенин", "Черепенников", "Черепичников", "Черепнин", "Черкас", "Черкасов", "Черкашенинов", "Черкашин", "Черкесов", "Чернавин", "Чернавкин", "Чернавский", "Чернаков", "Чернев", "Черненко", "Черненков", "Чернецов", "Чернигин", "Черниговский", "Черниговцев", "Черникин", "Черников", "Чернин", "Черниченко", "Чернобаев", "Чернобай", "Чернобесов", "Чернобород", "Чернобров", "Чернобровкин", "Чернобровый", "Чернов", "Черноглазкин", "Черноглазов", "Черноголовкин", "Черногор", "Черногоров", "Черногубов", "Чернозубов", "Черноиванов", "Чернокалов", "Чернокожев", "Чернолихов", "Черномор", "Черномордик", "Черномордиков", "Черномордин", "Черноморский", "Черноморченко", "Черномырдин", "Чернонебов", "Черноног", "Черноножкин", "Черноок", "Чернооков", "ЧернопанЯвкин", "Чернопаневкин", "Чернопащенко", "Чернопрудов", "Чернопуп", "Чернопятов", "Черноротов", "Чернорубашкин", "Черносвитов", "Черноскутов", "Черносовкин", "Черноус", "Черноусов", "Черноусько", "Черношей", "Черноштан", "Чернощей", "Чернощек", "Чернощекий", "Чернощеков", "Чернуха", "Чернухин", "Чернушевич", "Черный", "Черных", "Чернышев", "Чернышевский", "Чернышков", "Чернышов", "Чернявский", "Черняев", "Черняк", "Черняков", "Чернятин", "Чернятинский", "Черняховский", "Чертков", "Чертов", "Чертовский", "Чертовской", "Черюканов", "Ческидов", "Чеснов", "Чесноков", "Четвериков", "Четвертак", "Четвертаков", "Четвертинский", "Четвертков", "Чехов", "Чехонин", "Чечегов", "Чеченев", "Чеченин", "Чеченков", "Чечин", "Чечнев", "Чечуев", "Чечуков", "Чечулин", "Чешихин", "Чешкин", "Чешков", "Чибизов", "Чибисов", "Чивилев", "Чивилихин", "Чиж", "Чижев", "Чижевский", "Чиженок", "Чижик", "Чижиков", "Чикильдеев", "Чиков", "Чикомасов", "Чиликин", "Чиликов", "Чилимов", "Чилингаров", "Чилингиров", "Чиняев", "Чириков", "Чирков", "Чиркунов", "Чирсков", "Чистяков", "Чичеватов", "Чкалов", "Чмарин", "Чмутов", "Чмыхов", "Чоботов", "Чорыгов", "Чохов", "Чубанов", "Чубарев", "Чубаров", "Чубенко", "Чувашов", "Чугунихин", "Чугунов", "Чудин", "Чудинов", "Чудихин", "Чудов", "Чуев", "Чуешков", "Чуешов", "Чуйков", "Чукавин", "Чуканов", "Чукин", "Чулимов", "Чумаков", "Чупаев", "Чупахин", "Чупраков", "Чупрасов", "Чуприн", "Чупров", "Чупыркин", "Чураков", "Чурбанов", "Чуриков", "Чурилин", "Чурилов", "Чурин", "Чуркин", "Чуров", "Чурсин", "Чусовитин", "Чусовлянинов", "Чусовлянов", "Чуфаров", "Чухнин", "Чухнов", "Чухонцев", "Чучков", "", "Шабалдин", "Шабалин", "Шабалкин", "Шабанов", "Шабаршин", "Шабасанов", "Шабашев", "Шабашкин", "Шабашов", "Шабельников", "Шабельянов", "Шабров", "Шабунин", "Шабунов", "Шабуров", "Шавельский", "Шаверин", "Шавин", "Шавитов", "Шавкалов", "Шавкунин", "Шавкунов", "Шавкута", "Шавкутин", "Шаврин", "Шавров", "Шавруков", "Шавырев", "Шавырин", "Шагаев", "Шагал", "Шагалов", "Шагалович", "Шагин", "Шагловитов", "Шадрин", "Шадринцев", "Шадрунов", "Шайкин", "Шакловитов", "Шакловитый", "Шакшин", "Шалабаев", "Шалавин", "Шалагин", "Шалаев", "Шаламов", "Шалгачев", "Шалгунников", "Шалгунов", "Шалимов", "Шаломатов", "Шаломытов", "Шалухин", "Шалфеев", "Шалыганов", "Шалыгин", "Шальнов", "Шаляпин", "Шамагдиев", "Шамардин", "Шамбуров", "Шамгаев", "Шамин", "Шамов", "Шамонин", "Шамсев", "Шамсутдинов", "Шамуратов", "Шамухамедов", "Шамшев", "Шамшин", "Шамшурин", "Шамынин", "Шангин", "Шандыба", "Шандыбин", "Шанин", "Шанский", "Шаныгин", "Шаньгин", "Шанявин", "Шанявский", "Шаперин", "Шапира", "Шапиркин", "Шапиро", "Шапиров", "Шапкин", "Шаповал", "Шаповалов", "Шапорин", "Шапочников", "Шапошников", "Шапчихин", "Шараборин", "Шарагин", "Шараев", "Шарамыгин", "Шарапов", "Шарафеев", "Шарафутдинов", "Шарахов", "Шарашов", "Шардин", "Шариков", "Шарков", "Шарнин", "Шаров", "Шароватов", "Шароватый", "Шароглазов", "Шаронин", "Шаронов", "Шарохин", "Шаршавин", "Шаршавый", "Шарыпов", "Шастинский", "Шастов", "Шастунов", "Шатагин", "Шаталин", "Шаталкин", "Шаталов", "Шатерников", "Шатилин", "Шатило", "Шатилов", "Шатиль", "Шатихин", "Шатнев", "Шатнов", "Шатный", "Шатных", "Шатов", "Шатоха", "Шатохин", "Шатров", "Шатский", "Шатунин", "Шатунов", "Шатух", "Шатухин", "Шафаревич", "Шафаренко", "Шафиров", "Шахматов", "Шахметов", "Шахнюк", "Шахов", "Шаховский", "Шаховской", "Шацкий", "Шашин", "Шашкин", "Шашков", "Швалев", "Швалов", "Шварев", "Швед", "Шведкин", "Шведов", "Шведчиков", "Швейкин", "Швец", "Швецов", "Швиблов", "Швилев", "Швыдкин", "Швырев", "Швырин", "Швыряев", "Шебалин", "Шебанов", "Шебаршин", "Шебельников", "Шеберстов", "Шеболаев", "Шеборшин", "Шебунин", "Шевардин", "Шевелев", "Шевеленко", "Шевель", "Шевелькин", "Шевельков", "Шевлакин", "Шевлюгин", "Шевлягин", "Шевригин", "Шевцов", "Шевченко", "Шевчук", "Шевырев", "Шевырин", "Шевяков", "Шеглачев", "Шегловитый", "Шеин", "Шейдяков", "Шекунов", "Шелавин", "Шелаев", "Шелгунов", "Шелепин", "Шелепов", "Шелепугин", "Шелестов", "Шелехов", "Шелихов", "Шелковин", "Шелковый", "Шелконогов", "Шелогин", "Шеломатов", "Шеломский", "Шеломянцев", "Шелонцев", "Шелудяков", "Шелыгин", "Шемелин", "Шеметов", "Шемякин", "Шенкурский", "Шеншин", "Шепелев", "Шепель", "Шепотков", "Шептунов", "Шептуха", "Шептухин", "Шерапов", "Шервинский", "Шергин", "Шереметев", "Шереметьев", "Шерефединов", "Шерефетдинов", "Шерешков", "Шерстинский", "Шерстняков", "Шерстобитов", "Шерстобоев", "Шерстов", "Шерстюк", "Шерстюков", "Шерстянкин", "Шерстяных", "Шершавин", "Шершавый", "Шершнев", "Шестак", "Шестаков", "Шестериков", "Шестерин", "Шестеркин", "Шестернев", "Шестеров", "Шестипалов", "Шестиперов", "Шестников", "Шестов", "Шестопалов", "Шестоперов", "Шестунов", "Шестухин", "Шетенев", "Шетилов", "Шетнев", "Шибаев", "Шибаков", "Шибалов", "Шибанов", "Шиваров", "Шивов", "Шигин", "Шилин", "Шилкин", "Шило", "Шилобреев", "Шилов", "Шиловец", "Шиловский", "Шилоносов", "Шилохвостов", "Шильников", "Шильцев", "Шильцов", "Шиляков", "Шиманов", "Шимановский", "Шиманский", "Шимонов", "Шиморин", "Шингарев", "Шиндин", "Шиндяков", "Шиндяпин", "Шиндяпов", "Шинкарев", "Шинкаренков", "Шинкоренко", "Шиньков", "Шипилин", "Шипилов", "Шипин", "Шипицин", "Шипицын", "Шипков", "Шипов", "Шипулин", "Шипунов", "Ширинкин", "Ширинский", "Ширманов", "Широбоков", "Широкий", "Широких", "Широкобоков", "Широкобород", "Широкобородов", "Широков", "Широковский", "Широковских", "Широкоусов", "Широкоухов", "Широносов", "Ширшиков", "Ширшов", "Ширяев", "Шитиков", "Шитов", "Шитовкин", "Шитухин", "Шихирев", "Шихматов", "Шихов", "Шишагин", "Шишебаров", "Шишигин", "Шишин", "Шишканов", "Шишкин", "Шишков", "Шишман", "Шишманов", "Шишмарев", "Шишмонин", "Шишов", "Шишуков", "Шишулин", "Шкандыба", "Шкандыбин", "Шкиперов", "Шкловский", "Шкляров", "Шкода", "Шкодин", "Школьник", "Школьников", "Шкулев", "Шкурат", "Шкуратов", "Шкурин", "Шкурко", "Шкуров", "Шлыков", "Шлындин", "Шляков", "Шляндин", "Шляпников", "Шляхов", "Шляхтин", "Шлячков", "Шмаков", "Шманин", "Шмарин", "Шматов", "Шмелев", "Шмид", "Шмидт", "Шмидтов", "Шмонин", "Шмыга", "Шмыгин", "Шмыров", "Шнейдер", "Шнейдерман", "Шнейдеров", "Шовыркин", "Шологин", "Шолохов", "Шолыгин", "Шопин", "Шорин", "Шорников", "Шорохов", "Шохин", "Шошин", "Шпагин", "Шпак", "Шпаков", "Шпачков", "Шпитонов", "Шпитонцев", "Шпонкин", "Шпонов", "Шпынев", "Штин", "Штокалов", "Штыков", "Штырев", "Штыриков", "Штырин", "Штыркин", "Штырков", "Штыров", "Шубенок", "Шубин", "Шубницын", "Шубодеров", "Шуваев", "Шувайлов", "Шувакин", "Шувалов", "Шугаев", "Шудегов", "Шуенинов", "Шуйгин", "Шуйский", "Шуклин", "Шукрин", "Шукшин", "Шулейкин", "Шулепин", "Шулепников", "Шулепов", "Шулындин", "Шульга", "Шульгин", "Шульгинский", "Шульгиных", "Шульговский", "Шульженко", "Шульженков", "Шульпин", "Шуляк", "Шуляков", "Шумак", "Шумаков", "Шумарин", "Шумаркин", "Шумаров", "Шумбасов", "Шумеевский", "Шумилин", "Шумилкин", "Шумило", "Шумилов", "Шумихин", "Шумков", "Шумов", "Шумцов", "Шумяцкий", "Шунин", "Шунков", "Шуняев", "Шупелов", "Шуплецов", "Шуринов", "Шурпин", "Шурыгин", "Шустенков", "Шустиков", "Шустов", "Шустров", "Шут", "Шутегов", "Шутенков", "Шутиков", "Шутихин", "Шуткин", "Шутов", "Шутовых", "Шутьев", "Шухалов", "Шухмин", "Шухов", "Шухрин", "Шушарин", "Шушенцев", "Шушерин", "Шушлебин", "Шушлепин", "Шушмин", "Шушпанников", "Шушпанов", "Шушунов", "Шуяков", "Шуянов", "Шуянцев", "", "Щавелев", "Щаников", "Щанников", "Щапин", "Щапов", "Щебелев", "Щебенихин", "Щебнев", "Щеглов", "Щегловитов", "Щеголев", "Щеголихин", "Щедрин", "Щедринин", "Щедров", "Щедухин", "Щедушков", "Щекатов", "Щекатурин", "Щекатуров", "Щекин", "Щеколдин", "Щекотихин", "Щекотуров", "Щекочихин", "Щелкалов", "Щелканов", "Щелкачев", "Щелконогов", "Щелкунов", "Щелкухин", "Щелкушин", "Щелоков", "Щемелев", "Щемилов", "Щенин", "Щенкурский", "Щенников", "Щенятев", "Щепетильников", "Щепин", "Щепкин", "Щепликов", "Щепоткин", "Щепотьев", "Щепочкин", "Щепьев", "Щерба", "Щербак", "Щербаков", "Щербат", "Щербатов", "Щербатый", "Щербатых", "Щербачев", "Щербин", "Щербина", "Щербинин", "Щербинцев", "Щетинин", "Щетинкин", "Щетинников", "Щеткин", "Щеулин", "Щигловский", "Щигровский", "Щипалов", "Щипачев", "Щипунов", "Щитов", "Щолоков", "Щука", "Щукин", "Щулепников", "Щуплов", "Щур", "Щурин", "Щуркин", "Щурков", "Щуров", "", "Эварницкий", "Эвентов", "Эвергетов", "Эверлаков", "Эзерин", "Эзриелев", "Эзрин", "Эйлер", "Экземплярский", "Экономов", "Экспериментов", "Эктов", "Элевертов", "Электринцев", "Элиашев", "Эллинский", "Эльяашев", "Эльяшев", "Эльяшевич", "Эмиров", "Эрастов", "Эрдели", "Эрдниев", "Эрекаев", "Эрендженов", "Эренджентов", "Эсаулов", "Эскин", "Эсперов", "Эстеркин", "Эстис", "Эстрин", "Эфиров", "Эфраимов", "Эфроимович", "Эфроимсон", "Эфрон", "Эфрос", "", "Юберев", "Юберов", "Юбочников", "Югов", "Юдаев", "Юдаков", "Юданов", "Юдасин", "Юдасов", "Юдачев", "Юдашкин", "Юденко", "Юденков", "Юдин", "Юдинев", "Юдинов", "Юдинцев", "Юдичев", "Юдкин", "Юдов", "Юдочкин", "Южаков", "Южик", "Южиков", "Южин", "Юзефов", "Юкин", "Юксов", "Юлдашев", "Юлин", "Юматов", "Юмашев", "Юмин", "Юнев", "Юницкий", "Юнкеров", "Юнонов", "Юнусов", "Юпатов", "Юпин", "Юпинов", "Юпитеров", "Юран", "Юранов", "Юрасов", "Юревич", "Юренев", "Юренин", "Юривцев", "Юриков", "Юрин", "Юринов", "Юринский", "Юричев", "Юркевич", "Юркин", "Юрков", "Юрковец", "Юрлин", "Юрлов", "Юрманов", "Юрмегов", "Юрметов", "Юров", "Юровецкий", "Юрович", "Юровский", "Юрочкин", "Юрский", "Юртин", "Юрухин", "Юрцев", "Юрченко", "Юрчик", "Юрчук", "Юршев", "Юршевич", "Юрыгин", "Юрычев", "Юрышев", "Юрьев", "Юрьевский", "Юрьичев", "Юряев", "Юрятин", "Юсев", "Юсов", "Юстицкий", "Юстов", "Юстратов", "Юсупов", "Юсуфов", "Юсуфович", "Ютин", "Юфа", "Юффа", "Юханов", "Юхиев", "Юхименко", "Юхимов", "Юхимович", "Юхин", "Юхнев", "Юхнин", "Юхнов", "Юхов", "Юхтанов", "Юхтин", "Юшанкин", "Юшанков", "Юшин", "Юшкевич", "Юшкин", "Юшко", "Юшков", "Юшманов", "Ющев", "Ющенко", "Ющов", "Ющук", "", "Яблоков", "Яблоновский", "Яблонский", "Яблонских", "Яблочкин", "Яблочков", "Яблочников", "Яблуковский", "Явдохин", "Явлашкин", "Яволов", "Яворивский", "Яворницкий", "Яворов", "Яворовский", "Яворский", "Яганов", "Яглин", "Яглов", "Яглов", "Ягода", "Ягодин", "Ягодкин", "Ягодников", "Ягодницын", "Ягольников", "Ягольников", "Ягунов", "Ягупов", "Ягьяев", "Ядов", "Ядовин", "Ядовин", "Ядренкин", "Ядринцев", "Ядринцев", "Ядров", "Ядрышев", "Ядрышников", "Ядугин", "Язвенко", "Язвецов", "Язвин", "Язвицкий", "Язев", "Язев", "Язиков", "Язов", "Языков", "Языковский", "Язынин", "Яицкий", "Яицких", "Яйчиков", "Якиманский", "Якиманский", "Якименко", "Якимец", "Якимихин", "Якимишин", "Якимкин", "Якимков", "Якимов", "Якимычев", "Якир", "Якирин", "Якиров", "Якобец", "Якобсон", "Яковель", "Яковенко", "Яковин", "Яковкин", "Яковлев", "Яковуник", "Яковцев", "Яковченко", "Якорев", "Якуб", "Якуба", "Якубенко", "Якубов", "Якубович", "Якубовский", "Якуников", "Якунин", "Якункин", "Якунников", "Якунцов", "Якунчиков", "Якунькин", "Якупов", "Якутин", "Якуш", "Якушев", "Якушевский", "Якушенко", "Якушин", "Якушкин", "Якушов", "Якущенко", "Якшевич", "Якшин", "Якшонков", "Якымец", "Ялевалов", "Ялов", "Яловенко", "Яловкин", "Яловой", "Яловчук", "Яльцев", "Яльцев", "Яманатов", "Яманешков", "Яманов", "Ямпольский", "Ямских", "Ямской", "Ямщиков", "Ямщичкин", "Ямщичков", "Яненко", "Яникеев", "Янин", "Яничкин", "Янишев", "Янкевич", "Янкелевич", "Янкин", "Янков", "Янковец", "Янкович", "Янковский", "Янов", "Яновский", "Яновцев", "Яночка", "Яночкин", "Яношин", "Янусов", "Янухин", "Янушев", "Янушкин", "Янчев", "Янчевский", "Янченко", "Янченков", "Янчук", "Янчурев", "Янчуров", "Яншев", "Яншин", "Яншинов", "Яншонок", "Яныгин", "Янышев", "Янькин", "Янько", "Яньшин", "Янюк", "Янюшин", "Янюшкин", "Япаров", "Яппаров", "Ярандин", "Яранцев", "Яременко", "Яременюк", "Яремич", "Яремчук", "Ярилин", "Ярилин", "Ярилов", "Яринцев", "Ярков", "Ярмишко", "Ярмоленко", "Ярмолинский", "Ярмолинцев", "Ярмолович", "Ярмольник", "Ярмолюк", "Ярмошевич", "Ярнев", "Ярных", "Яров", "Яровенко", "Яровиков", "Яровой", "Ярополов", "Ярославлев", "Ярославов", "Ярославский", "Ярославцев", "Ярочкин", "Ярочкин", "Ярош", "Ярошев", "Ярошев", "Ярошевич", "Ярошевский", "Ярошенко", "Ярошкин", "Ярошук", "Ярощук", "Яругин", "Ярулин", "Ярулин", "Яруллин", "Ярунин", "Ярунин", "Ярунов", "Ярусов", "Ярушкин", "Ярушков", "Ярхо", "Ярцев", "Ярыгин", "Ярыжкин", "Ярый", "Ярых", "Ярышкин", "Ясаков", "Ясаков", "Ясенев", "Яснов", "Яснов", "Ясногородский", "Ясногорский", "Ясный", "Ясонов", "Ястин", "Ястин", "Ястреб", "Ястребов", "Ястребцов", "Ястремский", "Ястржембский", "Ясырев", "Ясырев", "Яськив", "Яськин", "Яськов", "Яткин", "Ятнов", "Яфаров", "Яффе", "Яхимов", "Яхимович", "Яхин", "Яхлаков", "Яхнин", "Яхно", "Яхнов", "Яхновский", "Яхонт", "Яхонтов", "Яхонтов", "Яхремов", "Яхримов", "Яхъев", "Яхьев", "Яхья", "Яхьяев", "Яхяев", "Яцейко", "Яценко", "Яцкив", "Яцкий", "Яцких", "Яцко", "Яцков", "Яцкой", "Яцук", "Яцуков", "Яцухно", "Яцюк", "Ячин", "Ячин", "Ячменев", "Ячнев", "Яшаев", "Яшанов", "Яшенькин", "Яшенькин", "Яшечкин", "Яшин", "Яшкевич", "Яшкин", "Яшков", "Яшнев", "Яшник", "Яшников", "Яшников", "Яшнов", "Яшуков", "Яшунин", "Яшурин", "Яшутин", "Ященко", "Ященко", "Ящерицын", "Ящишин", "Ящук", "Ящуков", "Ящуков", "Ящуков"]
        },

        // Data taken from https://github.com/umpirsky/country-list/blob/master/data/en_US/country.json
        countries: [{"name":"Afghanistan","abbreviation":"AF"},{"name":"Åland Islands","abbreviation":"AX"},{"name":"Albania","abbreviation":"AL"},{"name":"Algeria","abbreviation":"DZ"},{"name":"American Samoa","abbreviation":"AS"},{"name":"Andorra","abbreviation":"AD"},{"name":"Angola","abbreviation":"AO"},{"name":"Anguilla","abbreviation":"AI"},{"name":"Antarctica","abbreviation":"AQ"},{"name":"Antigua & Barbuda","abbreviation":"AG"},{"name":"Argentina","abbreviation":"AR"},{"name":"Armenia","abbreviation":"AM"},{"name":"Aruba","abbreviation":"AW"},{"name":"Ascension Island","abbreviation":"AC"},{"name":"Australia","abbreviation":"AU"},{"name":"Austria","abbreviation":"AT"},{"name":"Azerbaijan","abbreviation":"AZ"},{"name":"Bahamas","abbreviation":"BS"},{"name":"Bahrain","abbreviation":"BH"},{"name":"Bangladesh","abbreviation":"BD"},{"name":"Barbados","abbreviation":"BB"},{"name":"Belarus","abbreviation":"BY"},{"name":"Belgium","abbreviation":"BE"},{"name":"Belize","abbreviation":"BZ"},{"name":"Benin","abbreviation":"BJ"},{"name":"Bermuda","abbreviation":"BM"},{"name":"Bhutan","abbreviation":"BT"},{"name":"Bolivia","abbreviation":"BO"},{"name":"Bosnia & Herzegovina","abbreviation":"BA"},{"name":"Botswana","abbreviation":"BW"},{"name":"Brazil","abbreviation":"BR"},{"name":"British Indian Ocean Territory","abbreviation":"IO"},{"name":"British Virgin Islands","abbreviation":"VG"},{"name":"Brunei","abbreviation":"BN"},{"name":"Bulgaria","abbreviation":"BG"},{"name":"Burkina Faso","abbreviation":"BF"},{"name":"Burundi","abbreviation":"BI"},{"name":"Cambodia","abbreviation":"KH"},{"name":"Cameroon","abbreviation":"CM"},{"name":"Canada","abbreviation":"CA"},{"name":"Canary Islands","abbreviation":"IC"},{"name":"Cape Verde","abbreviation":"CV"},{"name":"Caribbean Netherlands","abbreviation":"BQ"},{"name":"Cayman Islands","abbreviation":"KY"},{"name":"Central African Republic","abbreviation":"CF"},{"name":"Ceuta & Melilla","abbreviation":"EA"},{"name":"Chad","abbreviation":"TD"},{"name":"Chile","abbreviation":"CL"},{"name":"China","abbreviation":"CN"},{"name":"Christmas Island","abbreviation":"CX"},{"name":"Cocos (Keeling) Islands","abbreviation":"CC"},{"name":"Colombia","abbreviation":"CO"},{"name":"Comoros","abbreviation":"KM"},{"name":"Congo - Brazzaville","abbreviation":"CG"},{"name":"Congo - Kinshasa","abbreviation":"CD"},{"name":"Cook Islands","abbreviation":"CK"},{"name":"Costa Rica","abbreviation":"CR"},{"name":"Côte d'Ivoire","abbreviation":"CI"},{"name":"Croatia","abbreviation":"HR"},{"name":"Cuba","abbreviation":"CU"},{"name":"Curaçao","abbreviation":"CW"},{"name":"Cyprus","abbreviation":"CY"},{"name":"Czech Republic","abbreviation":"CZ"},{"name":"Denmark","abbreviation":"DK"},{"name":"Diego Garcia","abbreviation":"DG"},{"name":"Djibouti","abbreviation":"DJ"},{"name":"Dominica","abbreviation":"DM"},{"name":"Dominican Republic","abbreviation":"DO"},{"name":"Ecuador","abbreviation":"EC"},{"name":"Egypt","abbreviation":"EG"},{"name":"El Salvador","abbreviation":"SV"},{"name":"Equatorial Guinea","abbreviation":"GQ"},{"name":"Eritrea","abbreviation":"ER"},{"name":"Estonia","abbreviation":"EE"},{"name":"Ethiopia","abbreviation":"ET"},{"name":"Falkland Islands","abbreviation":"FK"},{"name":"Faroe Islands","abbreviation":"FO"},{"name":"Fiji","abbreviation":"FJ"},{"name":"Finland","abbreviation":"FI"},{"name":"France","abbreviation":"FR"},{"name":"French Guiana","abbreviation":"GF"},{"name":"French Polynesia","abbreviation":"PF"},{"name":"French Southern Territories","abbreviation":"TF"},{"name":"Gabon","abbreviation":"GA"},{"name":"Gambia","abbreviation":"GM"},{"name":"Georgia","abbreviation":"GE"},{"name":"Germany","abbreviation":"DE"},{"name":"Ghana","abbreviation":"GH"},{"name":"Gibraltar","abbreviation":"GI"},{"name":"Greece","abbreviation":"GR"},{"name":"Greenland","abbreviation":"GL"},{"name":"Grenada","abbreviation":"GD"},{"name":"Guadeloupe","abbreviation":"GP"},{"name":"Guam","abbreviation":"GU"},{"name":"Guatemala","abbreviation":"GT"},{"name":"Guernsey","abbreviation":"GG"},{"name":"Guinea","abbreviation":"GN"},{"name":"Guinea-Bissau","abbreviation":"GW"},{"name":"Guyana","abbreviation":"GY"},{"name":"Haiti","abbreviation":"HT"},{"name":"Honduras","abbreviation":"HN"},{"name":"Hong Kong SAR China","abbreviation":"HK"},{"name":"Hungary","abbreviation":"HU"},{"name":"Iceland","abbreviation":"IS"},{"name":"India","abbreviation":"IN"},{"name":"Indonesia","abbreviation":"ID"},{"name":"Iran","abbreviation":"IR"},{"name":"Iraq","abbreviation":"IQ"},{"name":"Ireland","abbreviation":"IE"},{"name":"Isle of Man","abbreviation":"IM"},{"name":"Israel","abbreviation":"IL"},{"name":"Italy","abbreviation":"IT"},{"name":"Jamaica","abbreviation":"JM"},{"name":"Japan","abbreviation":"JP"},{"name":"Jersey","abbreviation":"JE"},{"name":"Jordan","abbreviation":"JO"},{"name":"Kazakhstan","abbreviation":"KZ"},{"name":"Kenya","abbreviation":"KE"},{"name":"Kiribati","abbreviation":"KI"},{"name":"Kosovo","abbreviation":"XK"},{"name":"Kuwait","abbreviation":"KW"},{"name":"Kyrgyzstan","abbreviation":"KG"},{"name":"Laos","abbreviation":"LA"},{"name":"Latvia","abbreviation":"LV"},{"name":"Lebanon","abbreviation":"LB"},{"name":"Lesotho","abbreviation":"LS"},{"name":"Liberia","abbreviation":"LR"},{"name":"Libya","abbreviation":"LY"},{"name":"Liechtenstein","abbreviation":"LI"},{"name":"Lithuania","abbreviation":"LT"},{"name":"Luxembourg","abbreviation":"LU"},{"name":"Macau SAR China","abbreviation":"MO"},{"name":"Macedonia","abbreviation":"MK"},{"name":"Madagascar","abbreviation":"MG"},{"name":"Malawi","abbreviation":"MW"},{"name":"Malaysia","abbreviation":"MY"},{"name":"Maldives","abbreviation":"MV"},{"name":"Mali","abbreviation":"ML"},{"name":"Malta","abbreviation":"MT"},{"name":"Marshall Islands","abbreviation":"MH"},{"name":"Martinique","abbreviation":"MQ"},{"name":"Mauritania","abbreviation":"MR"},{"name":"Mauritius","abbreviation":"MU"},{"name":"Mayotte","abbreviation":"YT"},{"name":"Mexico","abbreviation":"MX"},{"name":"Micronesia","abbreviation":"FM"},{"name":"Moldova","abbreviation":"MD"},{"name":"Monaco","abbreviation":"MC"},{"name":"Mongolia","abbreviation":"MN"},{"name":"Montenegro","abbreviation":"ME"},{"name":"Montserrat","abbreviation":"MS"},{"name":"Morocco","abbreviation":"MA"},{"name":"Mozambique","abbreviation":"MZ"},{"name":"Myanmar (Burma)","abbreviation":"MM"},{"name":"Namibia","abbreviation":"NA"},{"name":"Nauru","abbreviation":"NR"},{"name":"Nepal","abbreviation":"NP"},{"name":"Netherlands","abbreviation":"NL"},{"name":"New Caledonia","abbreviation":"NC"},{"name":"New Zealand","abbreviation":"NZ"},{"name":"Nicaragua","abbreviation":"NI"},{"name":"Niger","abbreviation":"NE"},{"name":"Nigeria","abbreviation":"NG"},{"name":"Niue","abbreviation":"NU"},{"name":"Norfolk Island","abbreviation":"NF"},{"name":"North Korea","abbreviation":"KP"},{"name":"Northern Mariana Islands","abbreviation":"MP"},{"name":"Norway","abbreviation":"NO"},{"name":"Oman","abbreviation":"OM"},{"name":"Pakistan","abbreviation":"PK"},{"name":"Palau","abbreviation":"PW"},{"name":"Palestinian Territories","abbreviation":"PS"},{"name":"Panama","abbreviation":"PA"},{"name":"Papua New Guinea","abbreviation":"PG"},{"name":"Paraguay","abbreviation":"PY"},{"name":"Peru","abbreviation":"PE"},{"name":"Philippines","abbreviation":"PH"},{"name":"Pitcairn Islands","abbreviation":"PN"},{"name":"Poland","abbreviation":"PL"},{"name":"Portugal","abbreviation":"PT"},{"name":"Puerto Rico","abbreviation":"PR"},{"name":"Qatar","abbreviation":"QA"},{"name":"Réunion","abbreviation":"RE"},{"name":"Romania","abbreviation":"RO"},{"name":"Russia","abbreviation":"RU"},{"name":"Rwanda","abbreviation":"RW"},{"name":"Samoa","abbreviation":"WS"},{"name":"San Marino","abbreviation":"SM"},{"name":"São Tomé and Príncipe","abbreviation":"ST"},{"name":"Saudi Arabia","abbreviation":"SA"},{"name":"Senegal","abbreviation":"SN"},{"name":"Serbia","abbreviation":"RS"},{"name":"Seychelles","abbreviation":"SC"},{"name":"Sierra Leone","abbreviation":"SL"},{"name":"Singapore","abbreviation":"SG"},{"name":"Sint Maarten","abbreviation":"SX"},{"name":"Slovakia","abbreviation":"SK"},{"name":"Slovenia","abbreviation":"SI"},{"name":"Solomon Islands","abbreviation":"SB"},{"name":"Somalia","abbreviation":"SO"},{"name":"South Africa","abbreviation":"ZA"},{"name":"South Georgia & South Sandwich Islands","abbreviation":"GS"},{"name":"South Korea","abbreviation":"KR"},{"name":"South Sudan","abbreviation":"SS"},{"name":"Spain","abbreviation":"ES"},{"name":"Sri Lanka","abbreviation":"LK"},{"name":"St. Barthélemy","abbreviation":"BL"},{"name":"St. Helena","abbreviation":"SH"},{"name":"St. Kitts & Nevis","abbreviation":"KN"},{"name":"St. Lucia","abbreviation":"LC"},{"name":"St. Martin","abbreviation":"MF"},{"name":"St. Pierre & Miquelon","abbreviation":"PM"},{"name":"St. Vincent & Grenadines","abbreviation":"VC"},{"name":"Sudan","abbreviation":"SD"},{"name":"Suriname","abbreviation":"SR"},{"name":"Svalbard & Jan Mayen","abbreviation":"SJ"},{"name":"Swaziland","abbreviation":"SZ"},{"name":"Sweden","abbreviation":"SE"},{"name":"Switzerland","abbreviation":"CH"},{"name":"Syria","abbreviation":"SY"},{"name":"Taiwan","abbreviation":"TW"},{"name":"Tajikistan","abbreviation":"TJ"},{"name":"Tanzania","abbreviation":"TZ"},{"name":"Thailand","abbreviation":"TH"},{"name":"Timor-Leste","abbreviation":"TL"},{"name":"Togo","abbreviation":"TG"},{"name":"Tokelau","abbreviation":"TK"},{"name":"Tonga","abbreviation":"TO"},{"name":"Trinidad & Tobago","abbreviation":"TT"},{"name":"Tristan da Cunha","abbreviation":"TA"},{"name":"Tunisia","abbreviation":"TN"},{"name":"Turkey","abbreviation":"TR"},{"name":"Turkmenistan","abbreviation":"TM"},{"name":"Turks & Caicos Islands","abbreviation":"TC"},{"name":"Tuvalu","abbreviation":"TV"},{"name":"U.S. Outlying Islands","abbreviation":"UM"},{"name":"U.S. Virgin Islands","abbreviation":"VI"},{"name":"Uganda","abbreviation":"UG"},{"name":"Ukraine","abbreviation":"UA"},{"name":"United Arab Emirates","abbreviation":"AE"},{"name":"United Kingdom","abbreviation":"GB"},{"name":"United States","abbreviation":"US"},{"name":"Uruguay","abbreviation":"UY"},{"name":"Uzbekistan","abbreviation":"UZ"},{"name":"Vanuatu","abbreviation":"VU"},{"name":"Vatican City","abbreviation":"VA"},{"name":"Venezuela","abbreviation":"VE"},{"name":"Vietnam","abbreviation":"VN"},{"name":"Wallis & Futuna","abbreviation":"WF"},{"name":"Western Sahara","abbreviation":"EH"},{"name":"Yemen","abbreviation":"YE"},{"name":"Zambia","abbreviation":"ZM"},{"name":"Zimbabwe","abbreviation":"ZW"}],

		counties: {
            // Data taken from http://www.downloadexcelfiles.com/gb_en/download-excel-file-list-counties-uk
            "uk": [
                {name: 'Bath and North East Somerset'},
                {name: 'Bedford'},
                {name: 'Blackburn with Darwen'},
                {name: 'Blackpool'},
                {name: 'Bournemouth'},
                {name: 'Bracknell Forest'},
                {name: 'Brighton & Hove'},
                {name: 'Bristol'},
                {name: 'Buckinghamshire'},
                {name: 'Cambridgeshire'},
                {name: 'Central Bedfordshire'},
                {name: 'Cheshire East'},
                {name: 'Cheshire West and Chester'},
                {name: 'Cornwall'},
                {name: 'County Durham'},
                {name: 'Cumbria'},
                {name: 'Darlington'},
                {name: 'Derby'},
                {name: 'Derbyshire'},
                {name: 'Devon'},
                {name: 'Dorset'},
                {name: 'East Riding of Yorkshire'},
                {name: 'East Sussex'},
                {name: 'Essex'},
                {name: 'Gloucestershire'},
                {name: 'Greater London'},
                {name: 'Greater Manchester'},
                {name: 'Halton'},
                {name: 'Hampshire'},
                {name: 'Hartlepool'},
                {name: 'Herefordshire'},
                {name: 'Hertfordshire'},
                {name: 'Hull'},
                {name: 'Isle of Wight'},
                {name: 'Isles of Scilly'},
                {name: 'Kent'},
                {name: 'Lancashire'},
                {name: 'Leicester'},
                {name: 'Leicestershire'},
                {name: 'Lincolnshire'},
                {name: 'Luton'},
                {name: 'Medway'},
                {name: 'Merseyside'},
                {name: 'Middlesbrough'},
                {name: 'Milton Keynes'},
                {name: 'Norfolk'},
                {name: 'North East Lincolnshire'},
                {name: 'North Lincolnshire'},
                {name: 'North Somerset'},
                {name: 'North Yorkshire'},
                {name: 'Northamptonshire'},
                {name: 'Northumberland'},
                {name: 'Nottingham'},
                {name: 'Nottinghamshire'},
                {name: 'Oxfordshire'},
                {name: 'Peterborough'},
                {name: 'Plymouth'},
                {name: 'Poole'},
                {name: 'Portsmouth'},
                {name: 'Reading'},
                {name: 'Redcar and Cleveland'},
                {name: 'Rutland'},
                {name: 'Shropshire'},
                {name: 'Slough'},
                {name: 'Somerset'},
                {name: 'South Gloucestershire'},
                {name: 'South Yorkshire'},
                {name: 'Southampton'},
                {name: 'Southend-on-Sea'},
                {name: 'Staffordshire'},
                {name: 'Stockton-on-Tees'},
                {name: 'Stoke-on-Trent'},
                {name: 'Suffolk'},
                {name: 'Surrey'},
                {name: 'Swindon'},
                {name: 'Telford and Wrekin'},
                {name: 'Thurrock'},
                {name: 'Torbay'},
                {name: 'Tyne and Wear'},
                {name: 'Warrington'},
                {name: 'Warwickshire'},
                {name: 'West Berkshire'},
                {name: 'West Midlands'},
                {name: 'West Sussex'},
                {name: 'West Yorkshire'},
                {name: 'Wiltshire'},
                {name: 'Windsor and Maidenhead'},
                {name: 'Wokingham'},
                {name: 'Worcestershire'},
                {name: 'York'}]
				},
        provinces: {
            "ca": [
                {name: 'Alberta', abbreviation: 'AB'},
                {name: 'British Columbia', abbreviation: 'BC'},
                {name: 'Manitoba', abbreviation: 'MB'},
                {name: 'New Brunswick', abbreviation: 'NB'},
                {name: 'Newfoundland and Labrador', abbreviation: 'NL'},
                {name: 'Nova Scotia', abbreviation: 'NS'},
                {name: 'Ontario', abbreviation: 'ON'},
                {name: 'Prince Edward Island', abbreviation: 'PE'},
                {name: 'Quebec', abbreviation: 'QC'},
                {name: 'Saskatchewan', abbreviation: 'SK'},

                // The case could be made that the following are not actually provinces
                // since they are technically considered "territories" however they all
                // look the same on an envelope!
                {name: 'Northwest Territories', abbreviation: 'NT'},
                {name: 'Nunavut', abbreviation: 'NU'},
                {name: 'Yukon', abbreviation: 'YT'}
            ],
            "it": [
                { name: "Agrigento", abbreviation: "AG", code: 84 },
                { name: "Alessandria", abbreviation: "AL", code: 6 },
                { name: "Ancona", abbreviation: "AN", code: 42 },
                { name: "Aosta", abbreviation: "AO", code: 7 },
                { name: "L'Aquila", abbreviation: "AQ", code: 66 },
                { name: "Arezzo", abbreviation: "AR", code: 51 },
                { name: "Ascoli-Piceno", abbreviation: "AP", code: 44 },
                { name: "Asti", abbreviation: "AT", code: 5 },
                { name: "Avellino", abbreviation: "AV", code: 64 },
                { name: "Bari", abbreviation: "BA", code: 72 },
                { name: "Barletta-Andria-Trani", abbreviation: "BT", code: 72 },
                { name: "Belluno", abbreviation: "BL", code: 25 },
                { name: "Benevento", abbreviation: "BN", code: 62 },
                { name: "Bergamo", abbreviation: "BG", code: 16 },
                { name: "Biella", abbreviation: "BI", code: 96 },
                { name: "Bologna", abbreviation: "BO", code: 37 },
                { name: "Bolzano", abbreviation: "BZ", code: 21 },
                { name: "Brescia", abbreviation: "BS", code: 17 },
                { name: "Brindisi", abbreviation: "BR", code: 74 },
                { name: "Cagliari", abbreviation: "CA", code: 92 },
                { name: "Caltanissetta", abbreviation: "CL", code: 85 },
                { name: "Campobasso", abbreviation: "CB", code: 70 },
                { name: "Carbonia Iglesias", abbreviation: "CI", code: 70 },
                { name: "Caserta", abbreviation: "CE", code: 61 },
                { name: "Catania", abbreviation: "CT", code: 87 },
                { name: "Catanzaro", abbreviation: "CZ", code: 79 },
                { name: "Chieti", abbreviation: "CH", code: 69 },
                { name: "Como", abbreviation: "CO", code: 13 },
                { name: "Cosenza", abbreviation: "CS", code: 78 },
                { name: "Cremona", abbreviation: "CR", code: 19 },
                { name: "Crotone", abbreviation: "KR", code: 101 },
                { name: "Cuneo", abbreviation: "CN", code: 4 },
                { name: "Enna", abbreviation: "EN", code: 86 },
                { name: "Fermo", abbreviation: "FM", code: 86 },
                { name: "Ferrara", abbreviation: "FE", code: 38 },
                { name: "Firenze", abbreviation: "FI", code: 48 },
                { name: "Foggia", abbreviation: "FG", code: 71 },
                { name: "Forli-Cesena", abbreviation: "FC", code: 71 },
                { name: "Frosinone", abbreviation: "FR", code: 60 },
                { name: "Genova", abbreviation: "GE", code: 10 },
                { name: "Gorizia", abbreviation: "GO", code: 31 },
                { name: "Grosseto", abbreviation: "GR", code: 53 },
                { name: "Imperia", abbreviation: "IM", code: 8 },
                { name: "Isernia", abbreviation: "IS", code: 94 },
                { name: "La-Spezia", abbreviation: "SP", code: 66 },
                { name: "Latina", abbreviation: "LT", code: 59 },
                { name: "Lecce", abbreviation: "LE", code: 75 },
                { name: "Lecco", abbreviation: "LC", code: 97 },
                { name: "Livorno", abbreviation: "LI", code: 49 },
                { name: "Lodi", abbreviation: "LO", code: 98 },
                { name: "Lucca", abbreviation: "LU", code: 46 },
                { name: "Macerata", abbreviation: "MC", code: 43 },
                { name: "Mantova", abbreviation: "MN", code: 20 },
                { name: "Massa-Carrara", abbreviation: "MS", code: 45 },
                { name: "Matera", abbreviation: "MT", code: 77 },
                { name: "Medio Campidano", abbreviation: "VS", code: 77 },
                { name: "Messina", abbreviation: "ME", code: 83 },
                { name: "Milano", abbreviation: "MI", code: 15 },
                { name: "Modena", abbreviation: "MO", code: 36 },
                { name: "Monza-Brianza", abbreviation: "MB", code: 36 },
                { name: "Napoli", abbreviation: "NA", code: 63 },
                { name: "Novara", abbreviation: "NO", code: 3 },
                { name: "Nuoro", abbreviation: "NU", code: 91 },
                { name: "Ogliastra", abbreviation: "OG", code: 91 },
                { name: "Olbia Tempio", abbreviation: "OT", code: 91 },
                { name: "Oristano", abbreviation: "OR", code: 95 },
                { name: "Padova", abbreviation: "PD", code: 28 },
                { name: "Palermo", abbreviation: "PA", code: 82 },
                { name: "Parma", abbreviation: "PR", code: 34 },
                { name: "Pavia", abbreviation: "PV", code: 18 },
                { name: "Perugia", abbreviation: "PG", code: 54 },
                { name: "Pesaro-Urbino", abbreviation: "PU", code: 41 },
                { name: "Pescara", abbreviation: "PE", code: 68 },
                { name: "Piacenza", abbreviation: "PC", code: 33 },
                { name: "Pisa", abbreviation: "PI", code: 50 },
                { name: "Pistoia", abbreviation: "PT", code: 47 },
                { name: "Pordenone", abbreviation: "PN", code: 93 },
                { name: "Potenza", abbreviation: "PZ", code: 76 },
                { name: "Prato", abbreviation: "PO", code: 100 },
                { name: "Ragusa", abbreviation: "RG", code: 88 },
                { name: "Ravenna", abbreviation: "RA", code: 39 },
                { name: "Reggio-Calabria", abbreviation: "RC", code: 35 },
                { name: "Reggio-Emilia", abbreviation: "RE", code: 35 },
                { name: "Rieti", abbreviation: "RI", code: 57 },
                { name: "Rimini", abbreviation: "RN", code: 99 },
                { name: "Roma", abbreviation: "Roma", code: 58 },
                { name: "Rovigo", abbreviation: "RO", code: 29 },
                { name: "Salerno", abbreviation: "SA", code: 65 },
                { name: "Sassari", abbreviation: "SS", code: 90 },
                { name: "Savona", abbreviation: "SV", code: 9 },
                { name: "Siena", abbreviation: "SI", code: 52 },
                { name: "Siracusa", abbreviation: "SR", code: 89 },
                { name: "Sondrio", abbreviation: "SO", code: 14 },
                { name: "Taranto", abbreviation: "TA", code: 73 },
                { name: "Teramo", abbreviation: "TE", code: 67 },
                { name: "Terni", abbreviation: "TR", code: 55 },
                { name: "Torino", abbreviation: "TO", code: 1 },
                { name: "Trapani", abbreviation: "TP", code: 81 },
                { name: "Trento", abbreviation: "TN", code: 22 },
                { name: "Treviso", abbreviation: "TV", code: 26 },
                { name: "Trieste", abbreviation: "TS", code: 32 },
                { name: "Udine", abbreviation: "UD", code: 30 },
                { name: "Varese", abbreviation: "VA", code: 12 },
                { name: "Venezia", abbreviation: "VE", code: 27 },
                { name: "Verbania", abbreviation: "VB", code: 27 },
                { name: "Vercelli", abbreviation: "VC", code: 2 },
                { name: "Verona", abbreviation: "VR", code: 23 },
                { name: "Vibo-Valentia", abbreviation: "VV", code: 102 },
                { name: "Vicenza", abbreviation: "VI", code: 24 },
                { name: "Viterbo", abbreviation: "VT", code: 56 }
            ]
        },

            // from: https://github.com/samsargent/Useful-Autocomplete-Data/blob/master/data/nationalities.json
        nationalities: [
           {name: 'Afghan'},
           {name: 'Albanian'},
           {name: 'Algerian'},
           {name: 'American'},
           {name: 'Andorran'},
           {name: 'Angolan'},
           {name: 'Antiguans'},
           {name: 'Argentinean'},
           {name: 'Armenian'},
           {name: 'Australian'},
           {name: 'Austrian'},
           {name: 'Azerbaijani'},
           {name: 'Bahami'},
           {name: 'Bahraini'},
           {name: 'Bangladeshi'},
           {name: 'Barbadian'},
           {name: 'Barbudans'},
           {name: 'Batswana'},
           {name: 'Belarusian'},
           {name: 'Belgian'},
           {name: 'Belizean'},
           {name: 'Beninese'},
           {name: 'Bhutanese'},
           {name: 'Bolivian'},
           {name: 'Bosnian'},
           {name: 'Brazilian'},
           {name: 'British'},
           {name: 'Bruneian'},
           {name: 'Bulgarian'},
           {name: 'Burkinabe'},
           {name: 'Burmese'},
           {name: 'Burundian'},
           {name: 'Cambodian'},
           {name: 'Cameroonian'},
           {name: 'Canadian'},
           {name: 'Cape Verdean'},
           {name: 'Central African'},
           {name: 'Chadian'},
           {name: 'Chilean'},
           {name: 'Chinese'},
           {name: 'Colombian'},
           {name: 'Comoran'},
           {name: 'Congolese'},
           {name: 'Costa Rican'},
           {name: 'Croatian'},
           {name: 'Cuban'},
           {name: 'Cypriot'},
           {name: 'Czech'},
           {name: 'Danish'},
           {name: 'Djibouti'},
           {name: 'Dominican'},
           {name: 'Dutch'},
           {name: 'East Timorese'},
           {name: 'Ecuadorean'},
           {name: 'Egyptian'},
           {name: 'Emirian'},
           {name: 'Equatorial Guinean'},
           {name: 'Eritrean'},
           {name: 'Estonian'},
           {name: 'Ethiopian'},
           {name: 'Fijian'},
           {name: 'Filipino'},
           {name: 'Finnish'},
           {name: 'French'},
           {name: 'Gabonese'},
           {name: 'Gambian'},
           {name: 'Georgian'},
           {name: 'German'},
           {name: 'Ghanaian'},
           {name: 'Greek'},
           {name: 'Grenadian'},
           {name: 'Guatemalan'},
           {name: 'Guinea-Bissauan'},
           {name: 'Guinean'},
           {name: 'Guyanese'},
           {name: 'Haitian'},
           {name: 'Herzegovinian'},
           {name: 'Honduran'},
           {name: 'Hungarian'},
           {name: 'I-Kiribati'},
           {name: 'Icelander'},
           {name: 'Indian'},
           {name: 'Indonesian'},
           {name: 'Iranian'},
           {name: 'Iraqi'},
           {name: 'Irish'},
           {name: 'Israeli'},
           {name: 'Italian'},
           {name: 'Ivorian'},
           {name: 'Jamaican'},
           {name: 'Japanese'},
           {name: 'Jordanian'},
           {name: 'Kazakhstani'},
           {name: 'Kenyan'},
           {name: 'Kittian and Nevisian'},
           {name: 'Kuwaiti'},
           {name: 'Kyrgyz'},
           {name: 'Laotian'},
           {name: 'Latvian'},
           {name: 'Lebanese'},
           {name: 'Liberian'},
           {name: 'Libyan'},
           {name: 'Liechtensteiner'},
           {name: 'Lithuanian'},
           {name: 'Luxembourger'},
           {name: 'Macedonian'},
           {name: 'Malagasy'},
           {name: 'Malawian'},
           {name: 'Malaysian'},
           {name: 'Maldivan'},
           {name: 'Malian'},
           {name: 'Maltese'},
           {name: 'Marshallese'},
           {name: 'Mauritanian'},
           {name: 'Mauritian'},
           {name: 'Mexican'},
           {name: 'Micronesian'},
           {name: 'Moldovan'},
           {name: 'Monacan'},
           {name: 'Mongolian'},
           {name: 'Moroccan'},
           {name: 'Mosotho'},
           {name: 'Motswana'},
           {name: 'Mozambican'},
           {name: 'Namibian'},
           {name: 'Nauruan'},
           {name: 'Nepalese'},
           {name: 'New Zealander'},
           {name: 'Nicaraguan'},
           {name: 'Nigerian'},
           {name: 'Nigerien'},
           {name: 'North Korean'},
           {name: 'Northern Irish'},
           {name: 'Norwegian'},
           {name: 'Omani'},
           {name: 'Pakistani'},
           {name: 'Palauan'},
           {name: 'Panamanian'},
           {name: 'Papua New Guinean'},
           {name: 'Paraguayan'},
           {name: 'Peruvian'},
           {name: 'Polish'},
           {name: 'Portuguese'},
           {name: 'Qatari'},
           {name: 'Romani'},
           {name: 'Russian'},
           {name: 'Rwandan'},
           {name: 'Saint Lucian'},
           {name: 'Salvadoran'},
           {name: 'Samoan'},
           {name: 'San Marinese'},
           {name: 'Sao Tomean'},
           {name: 'Saudi'},
           {name: 'Scottish'},
           {name: 'Senegalese'},
           {name: 'Serbian'},
           {name: 'Seychellois'},
           {name: 'Sierra Leonean'},
           {name: 'Singaporean'},
           {name: 'Slovakian'},
           {name: 'Slovenian'},
           {name: 'Solomon Islander'},
           {name: 'Somali'},
           {name: 'South African'},
           {name: 'South Korean'},
           {name: 'Spanish'},
           {name: 'Sri Lankan'},
           {name: 'Sudanese'},
           {name: 'Surinamer'},
           {name: 'Swazi'},
           {name: 'Swedish'},
           {name: 'Swiss'},
           {name: 'Syrian'},
           {name: 'Taiwanese'},
           {name: 'Tajik'},
           {name: 'Tanzanian'},
           {name: 'Thai'},
           {name: 'Togolese'},
           {name: 'Tongan'},
           {name: 'Trinidadian or Tobagonian'},
           {name: 'Tunisian'},
           {name: 'Turkish'},
           {name: 'Tuvaluan'},
           {name: 'Ugandan'},
           {name: 'Ukrainian'},
           {name: 'Uruguaya'},
           {name: 'Uzbekistani'},
           {name: 'Venezuela'},
           {name: 'Vietnamese'},
           {name: 'Wels'},
           {name: 'Yemenit'},
           {name: 'Zambia'},
           {name: 'Zimbabwe'},
        ],

        us_states_and_dc: [
            {name: 'Alabama', abbreviation: 'AL'},
            {name: 'Alaska', abbreviation: 'AK'},
            {name: 'Arizona', abbreviation: 'AZ'},
            {name: 'Arkansas', abbreviation: 'AR'},
            {name: 'California', abbreviation: 'CA'},
            {name: 'Colorado', abbreviation: 'CO'},
            {name: 'Connecticut', abbreviation: 'CT'},
            {name: 'Delaware', abbreviation: 'DE'},
            {name: 'District of Columbia', abbreviation: 'DC'},
            {name: 'Florida', abbreviation: 'FL'},
            {name: 'Georgia', abbreviation: 'GA'},
            {name: 'Hawaii', abbreviation: 'HI'},
            {name: 'Idaho', abbreviation: 'ID'},
            {name: 'Illinois', abbreviation: 'IL'},
            {name: 'Indiana', abbreviation: 'IN'},
            {name: 'Iowa', abbreviation: 'IA'},
            {name: 'Kansas', abbreviation: 'KS'},
            {name: 'Kentucky', abbreviation: 'KY'},
            {name: 'Louisiana', abbreviation: 'LA'},
            {name: 'Maine', abbreviation: 'ME'},
            {name: 'Maryland', abbreviation: 'MD'},
            {name: 'Massachusetts', abbreviation: 'MA'},
            {name: 'Michigan', abbreviation: 'MI'},
            {name: 'Minnesota', abbreviation: 'MN'},
            {name: 'Mississippi', abbreviation: 'MS'},
            {name: 'Missouri', abbreviation: 'MO'},
            {name: 'Montana', abbreviation: 'MT'},
            {name: 'Nebraska', abbreviation: 'NE'},
            {name: 'Nevada', abbreviation: 'NV'},
            {name: 'New Hampshire', abbreviation: 'NH'},
            {name: 'New Jersey', abbreviation: 'NJ'},
            {name: 'New Mexico', abbreviation: 'NM'},
            {name: 'New York', abbreviation: 'NY'},
            {name: 'North Carolina', abbreviation: 'NC'},
            {name: 'North Dakota', abbreviation: 'ND'},
            {name: 'Ohio', abbreviation: 'OH'},
            {name: 'Oklahoma', abbreviation: 'OK'},
            {name: 'Oregon', abbreviation: 'OR'},
            {name: 'Pennsylvania', abbreviation: 'PA'},
            {name: 'Rhode Island', abbreviation: 'RI'},
            {name: 'South Carolina', abbreviation: 'SC'},
            {name: 'South Dakota', abbreviation: 'SD'},
            {name: 'Tennessee', abbreviation: 'TN'},
            {name: 'Texas', abbreviation: 'TX'},
            {name: 'Utah', abbreviation: 'UT'},
            {name: 'Vermont', abbreviation: 'VT'},
            {name: 'Virginia', abbreviation: 'VA'},
            {name: 'Washington', abbreviation: 'WA'},
            {name: 'West Virginia', abbreviation: 'WV'},
            {name: 'Wisconsin', abbreviation: 'WI'},
            {name: 'Wyoming', abbreviation: 'WY'}
        ],

        territories: [
            {name: 'American Samoa', abbreviation: 'AS'},
            {name: 'Federated States of Micronesia', abbreviation: 'FM'},
            {name: 'Guam', abbreviation: 'GU'},
            {name: 'Marshall Islands', abbreviation: 'MH'},
            {name: 'Northern Mariana Islands', abbreviation: 'MP'},
            {name: 'Puerto Rico', abbreviation: 'PR'},
            {name: 'Virgin Islands, U.S.', abbreviation: 'VI'}
        ],

        armed_forces: [
            {name: 'Armed Forces Europe', abbreviation: 'AE'},
            {name: 'Armed Forces Pacific', abbreviation: 'AP'},
            {name: 'Armed Forces the Americas', abbreviation: 'AA'}
        ],

        country_regions: {
            it: [
                { name: "Valle d'Aosta", abbreviation: "VDA" },
                { name: "Piemonte", abbreviation: "PIE" },
                { name: "Lombardia", abbreviation: "LOM" },
                { name: "Veneto", abbreviation: "VEN" },
                { name: "Trentino Alto Adige", abbreviation: "TAA" },
                { name: "Friuli Venezia Giulia", abbreviation: "FVG" },
                { name: "Liguria", abbreviation: "LIG" },
                { name: "Emilia Romagna", abbreviation: "EMR" },
                { name: "Toscana", abbreviation: "TOS" },
                { name: "Umbria", abbreviation: "UMB" },
                { name: "Marche", abbreviation: "MAR" },
                { name: "Abruzzo", abbreviation: "ABR" },
                { name: "Lazio", abbreviation: "LAZ" },
                { name: "Campania", abbreviation: "CAM" },
                { name: "Puglia", abbreviation: "PUG" },
                { name: "Basilicata", abbreviation: "BAS" },
                { name: "Molise", abbreviation: "MOL" },
                { name: "Calabria", abbreviation: "CAL" },
                { name: "Sicilia", abbreviation: "SIC" },
                { name: "Sardegna", abbreviation: "SAR" }
            ]
        },

        street_suffixes: {
            'us': [
                {name: 'Avenue', abbreviation: 'Ave'},
                {name: 'Boulevard', abbreviation: 'Blvd'},
                {name: 'Center', abbreviation: 'Ctr'},
                {name: 'Circle', abbreviation: 'Cir'},
                {name: 'Court', abbreviation: 'Ct'},
                {name: 'Drive', abbreviation: 'Dr'},
                {name: 'Extension', abbreviation: 'Ext'},
                {name: 'Glen', abbreviation: 'Gln'},
                {name: 'Grove', abbreviation: 'Grv'},
                {name: 'Heights', abbreviation: 'Hts'},
                {name: 'Highway', abbreviation: 'Hwy'},
                {name: 'Junction', abbreviation: 'Jct'},
                {name: 'Key', abbreviation: 'Key'},
                {name: 'Lane', abbreviation: 'Ln'},
                {name: 'Loop', abbreviation: 'Loop'},
                {name: 'Manor', abbreviation: 'Mnr'},
                {name: 'Mill', abbreviation: 'Mill'},
                {name: 'Park', abbreviation: 'Park'},
                {name: 'Parkway', abbreviation: 'Pkwy'},
                {name: 'Pass', abbreviation: 'Pass'},
                {name: 'Path', abbreviation: 'Path'},
                {name: 'Pike', abbreviation: 'Pike'},
                {name: 'Place', abbreviation: 'Pl'},
                {name: 'Plaza', abbreviation: 'Plz'},
                {name: 'Point', abbreviation: 'Pt'},
                {name: 'Ridge', abbreviation: 'Rdg'},
                {name: 'River', abbreviation: 'Riv'},
                {name: 'Road', abbreviation: 'Rd'},
                {name: 'Square', abbreviation: 'Sq'},
                {name: 'Street', abbreviation: 'St'},
                {name: 'Terrace', abbreviation: 'Ter'},
                {name: 'Trail', abbreviation: 'Trl'},
                {name: 'Turnpike', abbreviation: 'Tpke'},
                {name: 'View', abbreviation: 'Vw'},
                {name: 'Way', abbreviation: 'Way'}
            ],
            'it': [
                { name: 'Accesso', abbreviation: 'Acc.' },
                { name: 'Alzaia', abbreviation: 'Alz.' },
                { name: 'Arco', abbreviation: 'Arco' },
                { name: 'Archivolto', abbreviation: 'Acv.' },
                { name: 'Arena', abbreviation: 'Arena' },
                { name: 'Argine', abbreviation: 'Argine' },
                { name: 'Bacino', abbreviation: 'Bacino' },
                { name: 'Banchi', abbreviation: 'Banchi' },
                { name: 'Banchina', abbreviation: 'Ban.' },
                { name: 'Bastioni', abbreviation: 'Bas.' },
                { name: 'Belvedere', abbreviation: 'Belv.' },
                { name: 'Borgata', abbreviation: 'B.ta' },
                { name: 'Borgo', abbreviation: 'B.go' },
                { name: 'Calata', abbreviation: 'Cal.' },
                { name: 'Calle', abbreviation: 'Calle' },
                { name: 'Campiello', abbreviation: 'Cam.' },
                { name: 'Campo', abbreviation: 'Cam.' },
                { name: 'Canale', abbreviation: 'Can.' },
                { name: 'Carraia', abbreviation: 'Carr.' },
                { name: 'Cascina', abbreviation: 'Cascina' },
                { name: 'Case sparse', abbreviation: 'c.s.' },
                { name: 'Cavalcavia', abbreviation: 'Cv.' },
                { name: 'Circonvallazione', abbreviation: 'Cv.' },
                { name: 'Complanare', abbreviation: 'C.re' },
                { name: 'Contrada', abbreviation: 'C.da' },
                { name: 'Corso', abbreviation: 'C.so' },
                { name: 'Corte', abbreviation: 'C.te' },
                { name: 'Cortile', abbreviation: 'C.le' },
                { name: 'Diramazione', abbreviation: 'Dir.' },
                { name: 'Fondaco', abbreviation: 'F.co' },
                { name: 'Fondamenta', abbreviation: 'F.ta' },
                { name: 'Fondo', abbreviation: 'F.do' },
                { name: 'Frazione', abbreviation: 'Fr.' },
                { name: 'Isola', abbreviation: 'Is.' },
                { name: 'Largo', abbreviation: 'L.go' },
                { name: 'Litoranea', abbreviation: 'Lit.' },
                { name: 'Lungolago', abbreviation: 'L.go lago' },
                { name: 'Lungo Po', abbreviation: 'l.go Po' },
                { name: 'Molo', abbreviation: 'Molo' },
                { name: 'Mura', abbreviation: 'Mura' },
                { name: 'Passaggio privato', abbreviation: 'pass. priv.' },
                { name: 'Passeggiata', abbreviation: 'Pass.' },
                { name: 'Piazza', abbreviation: 'P.zza' },
                { name: 'Piazzale', abbreviation: 'P.le' },
                { name: 'Ponte', abbreviation: 'P.te' },
                { name: 'Portico', abbreviation: 'P.co' },
                { name: 'Rampa', abbreviation: 'Rampa' },
                { name: 'Regione', abbreviation: 'Reg.' },
                { name: 'Rione', abbreviation: 'R.ne' },
                { name: 'Rio', abbreviation: 'Rio' },
                { name: 'Ripa', abbreviation: 'Ripa' },
                { name: 'Riva', abbreviation: 'Riva' },
                { name: 'Rondò', abbreviation: 'Rondò' },
                { name: 'Rotonda', abbreviation: 'Rot.' },
                { name: 'Sagrato', abbreviation: 'Sagr.' },
                { name: 'Salita', abbreviation: 'Sal.' },
                { name: 'Scalinata', abbreviation: 'Scal.' },
                { name: 'Scalone', abbreviation: 'Scal.' },
                { name: 'Slargo', abbreviation: 'Sl.' },
                { name: 'Sottoportico', abbreviation: 'Sott.' },
                { name: 'Strada', abbreviation: 'Str.' },
                { name: 'Stradale', abbreviation: 'Str.le' },
                { name: 'Strettoia', abbreviation: 'Strett.' },
                { name: 'Traversa', abbreviation: 'Trav.' },
                { name: 'Via', abbreviation: 'V.' },
                { name: 'Viale', abbreviation: 'V.le' },
                { name: 'Vicinale', abbreviation: 'Vic.le' },
                { name: 'Vicolo', abbreviation: 'Vic.' }
            ]
        },

        months: [
            {name: 'January', short_name: 'Jan', numeric: '01', days: 31},
            // Not messing with leap years...
            {name: 'February', short_name: 'Feb', numeric: '02', days: 28},
            {name: 'March', short_name: 'Mar', numeric: '03', days: 31},
            {name: 'April', short_name: 'Apr', numeric: '04', days: 30},
            {name: 'May', short_name: 'May', numeric: '05', days: 31},
            {name: 'June', short_name: 'Jun', numeric: '06', days: 30},
            {name: 'July', short_name: 'Jul', numeric: '07', days: 31},
            {name: 'August', short_name: 'Aug', numeric: '08', days: 31},
            {name: 'September', short_name: 'Sep', numeric: '09', days: 30},
            {name: 'October', short_name: 'Oct', numeric: '10', days: 31},
            {name: 'November', short_name: 'Nov', numeric: '11', days: 30},
            {name: 'December', short_name: 'Dec', numeric: '12', days: 31}
        ],

        // http://en.wikipedia.org/wiki/Bank_card_number#Issuer_identification_number_.28IIN.29
        cc_types: [
            {name: "American Express", short_name: 'amex', prefix: '34', length: 15},
            {name: "Bankcard", short_name: 'bankcard', prefix: '5610', length: 16},
            {name: "China UnionPay", short_name: 'chinaunion', prefix: '62', length: 16},
            {name: "Diners Club Carte Blanche", short_name: 'dccarte', prefix: '300', length: 14},
            {name: "Diners Club enRoute", short_name: 'dcenroute', prefix: '2014', length: 15},
            {name: "Diners Club International", short_name: 'dcintl', prefix: '36', length: 14},
            {name: "Diners Club United States & Canada", short_name: 'dcusc', prefix: '54', length: 16},
            {name: "Discover Card", short_name: 'discover', prefix: '6011', length: 16},
            {name: "InstaPayment", short_name: 'instapay', prefix: '637', length: 16},
            {name: "JCB", short_name: 'jcb', prefix: '3528', length: 16},
            {name: "Laser", short_name: 'laser', prefix: '6304', length: 16},
            {name: "Maestro", short_name: 'maestro', prefix: '5018', length: 16},
            {name: "Mastercard", short_name: 'mc', prefix: '51', length: 16},
            {name: "Solo", short_name: 'solo', prefix: '6334', length: 16},
            {name: "Switch", short_name: 'switch', prefix: '4903', length: 16},
            {name: "Visa", short_name: 'visa', prefix: '4', length: 16},
            {name: "Visa Electron", short_name: 'electron', prefix: '4026', length: 16}
        ],

        //return all world currency by ISO 4217
        currency_types: [
            {'code' : 'AED', 'name' : 'United Arab Emirates Dirham'},
            {'code' : 'AFN', 'name' : 'Afghanistan Afghani'},
            {'code' : 'ALL', 'name' : 'Albania Lek'},
            {'code' : 'AMD', 'name' : 'Armenia Dram'},
            {'code' : 'ANG', 'name' : 'Netherlands Antilles Guilder'},
            {'code' : 'AOA', 'name' : 'Angola Kwanza'},
            {'code' : 'ARS', 'name' : 'Argentina Peso'},
            {'code' : 'AUD', 'name' : 'Australia Dollar'},
            {'code' : 'AWG', 'name' : 'Aruba Guilder'},
            {'code' : 'AZN', 'name' : 'Azerbaijan New Manat'},
            {'code' : 'BAM', 'name' : 'Bosnia and Herzegovina Convertible Marka'},
            {'code' : 'BBD', 'name' : 'Barbados Dollar'},
            {'code' : 'BDT', 'name' : 'Bangladesh Taka'},
            {'code' : 'BGN', 'name' : 'Bulgaria Lev'},
            {'code' : 'BHD', 'name' : 'Bahrain Dinar'},
            {'code' : 'BIF', 'name' : 'Burundi Franc'},
            {'code' : 'BMD', 'name' : 'Bermuda Dollar'},
            {'code' : 'BND', 'name' : 'Brunei Darussalam Dollar'},
            {'code' : 'BOB', 'name' : 'Bolivia Boliviano'},
            {'code' : 'BRL', 'name' : 'Brazil Real'},
            {'code' : 'BSD', 'name' : 'Bahamas Dollar'},
            {'code' : 'BTN', 'name' : 'Bhutan Ngultrum'},
            {'code' : 'BWP', 'name' : 'Botswana Pula'},
            {'code' : 'BYR', 'name' : 'Belarus Ruble'},
            {'code' : 'BZD', 'name' : 'Belize Dollar'},
            {'code' : 'CAD', 'name' : 'Canada Dollar'},
            {'code' : 'CDF', 'name' : 'Congo/Kinshasa Franc'},
            {'code' : 'CHF', 'name' : 'Switzerland Franc'},
            {'code' : 'CLP', 'name' : 'Chile Peso'},
            {'code' : 'CNY', 'name' : 'China Yuan Renminbi'},
            {'code' : 'COP', 'name' : 'Colombia Peso'},
            {'code' : 'CRC', 'name' : 'Costa Rica Colon'},
            {'code' : 'CUC', 'name' : 'Cuba Convertible Peso'},
            {'code' : 'CUP', 'name' : 'Cuba Peso'},
            {'code' : 'CVE', 'name' : 'Cape Verde Escudo'},
            {'code' : 'CZK', 'name' : 'Czech Republic Koruna'},
            {'code' : 'DJF', 'name' : 'Djibouti Franc'},
            {'code' : 'DKK', 'name' : 'Denmark Krone'},
            {'code' : 'DOP', 'name' : 'Dominican Republic Peso'},
            {'code' : 'DZD', 'name' : 'Algeria Dinar'},
            {'code' : 'EGP', 'name' : 'Egypt Pound'},
            {'code' : 'ERN', 'name' : 'Eritrea Nakfa'},
            {'code' : 'ETB', 'name' : 'Ethiopia Birr'},
            {'code' : 'EUR', 'name' : 'Euro Member Countries'},
            {'code' : 'FJD', 'name' : 'Fiji Dollar'},
            {'code' : 'FKP', 'name' : 'Falkland Islands (Malvinas) Pound'},
            {'code' : 'GBP', 'name' : 'United Kingdom Pound'},
            {'code' : 'GEL', 'name' : 'Georgia Lari'},
            {'code' : 'GGP', 'name' : 'Guernsey Pound'},
            {'code' : 'GHS', 'name' : 'Ghana Cedi'},
            {'code' : 'GIP', 'name' : 'Gibraltar Pound'},
            {'code' : 'GMD', 'name' : 'Gambia Dalasi'},
            {'code' : 'GNF', 'name' : 'Guinea Franc'},
            {'code' : 'GTQ', 'name' : 'Guatemala Quetzal'},
            {'code' : 'GYD', 'name' : 'Guyana Dollar'},
            {'code' : 'HKD', 'name' : 'Hong Kong Dollar'},
            {'code' : 'HNL', 'name' : 'Honduras Lempira'},
            {'code' : 'HRK', 'name' : 'Croatia Kuna'},
            {'code' : 'HTG', 'name' : 'Haiti Gourde'},
            {'code' : 'HUF', 'name' : 'Hungary Forint'},
            {'code' : 'IDR', 'name' : 'Indonesia Rupiah'},
            {'code' : 'ILS', 'name' : 'Israel Shekel'},
            {'code' : 'IMP', 'name' : 'Isle of Man Pound'},
            {'code' : 'INR', 'name' : 'India Rupee'},
            {'code' : 'IQD', 'name' : 'Iraq Dinar'},
            {'code' : 'IRR', 'name' : 'Iran Rial'},
            {'code' : 'ISK', 'name' : 'Iceland Krona'},
            {'code' : 'JEP', 'name' : 'Jersey Pound'},
            {'code' : 'JMD', 'name' : 'Jamaica Dollar'},
            {'code' : 'JOD', 'name' : 'Jordan Dinar'},
            {'code' : 'JPY', 'name' : 'Japan Yen'},
            {'code' : 'KES', 'name' : 'Kenya Shilling'},
            {'code' : 'KGS', 'name' : 'Kyrgyzstan Som'},
            {'code' : 'KHR', 'name' : 'Cambodia Riel'},
            {'code' : 'KMF', 'name' : 'Comoros Franc'},
            {'code' : 'KPW', 'name' : 'Korea (North) Won'},
            {'code' : 'KRW', 'name' : 'Korea (South) Won'},
            {'code' : 'KWD', 'name' : 'Kuwait Dinar'},
            {'code' : 'KYD', 'name' : 'Cayman Islands Dollar'},
            {'code' : 'KZT', 'name' : 'Kazakhstan Tenge'},
            {'code' : 'LAK', 'name' : 'Laos Kip'},
            {'code' : 'LBP', 'name' : 'Lebanon Pound'},
            {'code' : 'LKR', 'name' : 'Sri Lanka Rupee'},
            {'code' : 'LRD', 'name' : 'Liberia Dollar'},
            {'code' : 'LSL', 'name' : 'Lesotho Loti'},
            {'code' : 'LTL', 'name' : 'Lithuania Litas'},
            {'code' : 'LYD', 'name' : 'Libya Dinar'},
            {'code' : 'MAD', 'name' : 'Morocco Dirham'},
            {'code' : 'MDL', 'name' : 'Moldova Leu'},
            {'code' : 'MGA', 'name' : 'Madagascar Ariary'},
            {'code' : 'MKD', 'name' : 'Macedonia Denar'},
            {'code' : 'MMK', 'name' : 'Myanmar (Burma) Kyat'},
            {'code' : 'MNT', 'name' : 'Mongolia Tughrik'},
            {'code' : 'MOP', 'name' : 'Macau Pataca'},
            {'code' : 'MRO', 'name' : 'Mauritania Ouguiya'},
            {'code' : 'MUR', 'name' : 'Mauritius Rupee'},
            {'code' : 'MVR', 'name' : 'Maldives (Maldive Islands) Rufiyaa'},
            {'code' : 'MWK', 'name' : 'Malawi Kwacha'},
            {'code' : 'MXN', 'name' : 'Mexico Peso'},
            {'code' : 'MYR', 'name' : 'Malaysia Ringgit'},
            {'code' : 'MZN', 'name' : 'Mozambique Metical'},
            {'code' : 'NAD', 'name' : 'Namibia Dollar'},
            {'code' : 'NGN', 'name' : 'Nigeria Naira'},
            {'code' : 'NIO', 'name' : 'Nicaragua Cordoba'},
            {'code' : 'NOK', 'name' : 'Norway Krone'},
            {'code' : 'NPR', 'name' : 'Nepal Rupee'},
            {'code' : 'NZD', 'name' : 'New Zealand Dollar'},
            {'code' : 'OMR', 'name' : 'Oman Rial'},
            {'code' : 'PAB', 'name' : 'Panama Balboa'},
            {'code' : 'PEN', 'name' : 'Peru Nuevo Sol'},
            {'code' : 'PGK', 'name' : 'Papua New Guinea Kina'},
            {'code' : 'PHP', 'name' : 'Philippines Peso'},
            {'code' : 'PKR', 'name' : 'Pakistan Rupee'},
            {'code' : 'PLN', 'name' : 'Poland Zloty'},
            {'code' : 'PYG', 'name' : 'Paraguay Guarani'},
            {'code' : 'QAR', 'name' : 'Qatar Riyal'},
            {'code' : 'RON', 'name' : 'Romania New Leu'},
            {'code' : 'RSD', 'name' : 'Serbia Dinar'},
            {'code' : 'RUB', 'name' : 'Russia Ruble'},
            {'code' : 'RWF', 'name' : 'Rwanda Franc'},
            {'code' : 'SAR', 'name' : 'Saudi Arabia Riyal'},
            {'code' : 'SBD', 'name' : 'Solomon Islands Dollar'},
            {'code' : 'SCR', 'name' : 'Seychelles Rupee'},
            {'code' : 'SDG', 'name' : 'Sudan Pound'},
            {'code' : 'SEK', 'name' : 'Sweden Krona'},
            {'code' : 'SGD', 'name' : 'Singapore Dollar'},
            {'code' : 'SHP', 'name' : 'Saint Helena Pound'},
            {'code' : 'SLL', 'name' : 'Sierra Leone Leone'},
            {'code' : 'SOS', 'name' : 'Somalia Shilling'},
            {'code' : 'SPL', 'name' : 'Seborga Luigino'},
            {'code' : 'SRD', 'name' : 'Suriname Dollar'},
            {'code' : 'STD', 'name' : 'São Tomé and Príncipe Dobra'},
            {'code' : 'SVC', 'name' : 'El Salvador Colon'},
            {'code' : 'SYP', 'name' : 'Syria Pound'},
            {'code' : 'SZL', 'name' : 'Swaziland Lilangeni'},
            {'code' : 'THB', 'name' : 'Thailand Baht'},
            {'code' : 'TJS', 'name' : 'Tajikistan Somoni'},
            {'code' : 'TMT', 'name' : 'Turkmenistan Manat'},
            {'code' : 'TND', 'name' : 'Tunisia Dinar'},
            {'code' : 'TOP', 'name' : 'Tonga Pa\'anga'},
            {'code' : 'TRY', 'name' : 'Turkey Lira'},
            {'code' : 'TTD', 'name' : 'Trinidad and Tobago Dollar'},
            {'code' : 'TVD', 'name' : 'Tuvalu Dollar'},
            {'code' : 'TWD', 'name' : 'Taiwan New Dollar'},
            {'code' : 'TZS', 'name' : 'Tanzania Shilling'},
            {'code' : 'UAH', 'name' : 'Ukraine Hryvnia'},
            {'code' : 'UGX', 'name' : 'Uganda Shilling'},
            {'code' : 'USD', 'name' : 'United States Dollar'},
            {'code' : 'UYU', 'name' : 'Uruguay Peso'},
            {'code' : 'UZS', 'name' : 'Uzbekistan Som'},
            {'code' : 'VEF', 'name' : 'Venezuela Bolivar'},
            {'code' : 'VND', 'name' : 'Viet Nam Dong'},
            {'code' : 'VUV', 'name' : 'Vanuatu Vatu'},
            {'code' : 'WST', 'name' : 'Samoa Tala'},
            {'code' : 'XAF', 'name' : 'Communauté Financière Africaine (BEAC) CFA Franc BEAC'},
            {'code' : 'XCD', 'name' : 'East Caribbean Dollar'},
            {'code' : 'XDR', 'name' : 'International Monetary Fund (IMF) Special Drawing Rights'},
            {'code' : 'XOF', 'name' : 'Communauté Financière Africaine (BCEAO) Franc'},
            {'code' : 'XPF', 'name' : 'Comptoirs Français du Pacifique (CFP) Franc'},
            {'code' : 'YER', 'name' : 'Yemen Rial'},
            {'code' : 'ZAR', 'name' : 'South Africa Rand'},
            {'code' : 'ZMW', 'name' : 'Zambia Kwacha'},
            {'code' : 'ZWD', 'name' : 'Zimbabwe Dollar'}
        ],

        // return the names of all valide colors
        colorNames : [  "AliceBlue", "Black", "Navy", "DarkBlue", "MediumBlue", "Blue", "DarkGreen", "Green", "Teal", "DarkCyan", "DeepSkyBlue", "DarkTurquoise", "MediumSpringGreen", "Lime", "SpringGreen",
            "Aqua", "Cyan", "MidnightBlue", "DodgerBlue", "LightSeaGreen", "ForestGreen", "SeaGreen", "DarkSlateGray", "LimeGreen", "MediumSeaGreen", "Turquoise", "RoyalBlue", "SteelBlue", "DarkSlateBlue", "MediumTurquoise",
            "Indigo", "DarkOliveGreen", "CadetBlue", "CornflowerBlue", "RebeccaPurple", "MediumAquaMarine", "DimGray", "SlateBlue", "OliveDrab", "SlateGray", "LightSlateGray", "MediumSlateBlue", "LawnGreen", "Chartreuse",
            "Aquamarine", "Maroon", "Purple", "Olive", "Gray", "SkyBlue", "LightSkyBlue", "BlueViolet", "DarkRed", "DarkMagenta", "SaddleBrown", "Ivory", "White",
            "DarkSeaGreen", "LightGreen", "MediumPurple", "DarkViolet", "PaleGreen", "DarkOrchid", "YellowGreen", "Sienna", "Brown", "DarkGray", "LightBlue", "GreenYellow", "PaleTurquoise", "LightSteelBlue", "PowderBlue",
            "FireBrick", "DarkGoldenRod", "MediumOrchid", "RosyBrown", "DarkKhaki", "Silver", "MediumVioletRed", "IndianRed", "Peru", "Chocolate", "Tan", "LightGray", "Thistle", "Orchid", "GoldenRod", "PaleVioletRed",
            "Crimson", "Gainsboro", "Plum", "BurlyWood", "LightCyan", "Lavender", "DarkSalmon", "Violet", "PaleGoldenRod", "LightCoral", "Khaki", "AliceBlue", "HoneyDew", "Azure", "SandyBrown", "Wheat", "Beige", "WhiteSmoke",
            "MintCream", "GhostWhite", "Salmon", "AntiqueWhite", "Linen", "LightGoldenRodYellow", "OldLace", "Red", "Fuchsia", "Magenta", "DeepPink", "OrangeRed", "Tomato", "HotPink", "Coral", "DarkOrange", "LightSalmon", "Orange",
            "LightPink", "Pink", "Gold", "PeachPuff", "NavajoWhite", "Moccasin", "Bisque", "MistyRose", "BlanchedAlmond", "PapayaWhip", "LavenderBlush", "SeaShell", "Cornsilk", "LemonChiffon", "FloralWhite", "Snow", "Yellow", "LightYellow"
        ],

        fileExtension : {
            "raster"    : ["bmp", "gif", "gpl", "ico", "jpeg", "psd", "png", "psp", "raw", "tiff"],
            "vector"    : ["3dv", "amf", "awg", "ai", "cgm", "cdr", "cmx", "dxf", "e2d", "egt", "eps", "fs", "odg", "svg", "xar"],
            "3d"        : ["3dmf", "3dm", "3mf", "3ds", "an8", "aoi", "blend", "cal3d", "cob", "ctm", "iob", "jas", "max", "mb", "mdx", "obj", "x", "x3d"],
            "document"  : ["doc", "docx", "dot", "html", "xml", "odt", "odm", "ott", "csv", "rtf", "tex", "xhtml", "xps"]
        },

        // Data taken from https://github.com/dmfilipenko/timezones.json/blob/master/timezones.json
        timezones: [
                  {
                    "name": "Dateline Standard Time",
                    "abbr": "DST",
                    "offset": -12,
                    "isdst": false,
                    "text": "(UTC-12:00) International Date Line West",
                    "utc": [
                      "Etc/GMT+12"
                    ]
                  },
                  {
                    "name": "UTC-11",
                    "abbr": "U",
                    "offset": -11,
                    "isdst": false,
                    "text": "(UTC-11:00) Coordinated Universal Time-11",
                    "utc": [
                      "Etc/GMT+11",
                      "Pacific/Midway",
                      "Pacific/Niue",
                      "Pacific/Pago_Pago"
                    ]
                  },
                  {
                    "name": "Hawaiian Standard Time",
                    "abbr": "HST",
                    "offset": -10,
                    "isdst": false,
                    "text": "(UTC-10:00) Hawaii",
                    "utc": [
                      "Etc/GMT+10",
                      "Pacific/Honolulu",
                      "Pacific/Johnston",
                      "Pacific/Rarotonga",
                      "Pacific/Tahiti"
                    ]
                  },
                  {
                    "name": "Alaskan Standard Time",
                    "abbr": "AKDT",
                    "offset": -8,
                    "isdst": true,
                    "text": "(UTC-09:00) Alaska",
                    "utc": [
                      "America/Anchorage",
                      "America/Juneau",
                      "America/Nome",
                      "America/Sitka",
                      "America/Yakutat"
                    ]
                  },
                  {
                    "name": "Pacific Standard Time (Mexico)",
                    "abbr": "PDT",
                    "offset": -7,
                    "isdst": true,
                    "text": "(UTC-08:00) Baja California",
                    "utc": [
                      "America/Santa_Isabel"
                    ]
                  },
                  {
                    "name": "Pacific Standard Time",
                    "abbr": "PDT",
                    "offset": -7,
                    "isdst": true,
                    "text": "(UTC-08:00) Pacific Time (US & Canada)",
                    "utc": [
                      "America/Dawson",
                      "America/Los_Angeles",
                      "America/Tijuana",
                      "America/Vancouver",
                      "America/Whitehorse",
                      "PST8PDT"
                    ]
                  },
                  {
                    "name": "US Mountain Standard Time",
                    "abbr": "UMST",
                    "offset": -7,
                    "isdst": false,
                    "text": "(UTC-07:00) Arizona",
                    "utc": [
                      "America/Creston",
                      "America/Dawson_Creek",
                      "America/Hermosillo",
                      "America/Phoenix",
                      "Etc/GMT+7"
                    ]
                  },
                  {
                    "name": "Mountain Standard Time (Mexico)",
                    "abbr": "MDT",
                    "offset": -6,
                    "isdst": true,
                    "text": "(UTC-07:00) Chihuahua, La Paz, Mazatlan",
                    "utc": [
                      "America/Chihuahua",
                      "America/Mazatlan"
                    ]
                  },
                  {
                    "name": "Mountain Standard Time",
                    "abbr": "MDT",
                    "offset": -6,
                    "isdst": true,
                    "text": "(UTC-07:00) Mountain Time (US & Canada)",
                    "utc": [
                      "America/Boise",
                      "America/Cambridge_Bay",
                      "America/Denver",
                      "America/Edmonton",
                      "America/Inuvik",
                      "America/Ojinaga",
                      "America/Yellowknife",
                      "MST7MDT"
                    ]
                  },
                  {
                    "name": "Central America Standard Time",
                    "abbr": "CAST",
                    "offset": -6,
                    "isdst": false,
                    "text": "(UTC-06:00) Central America",
                    "utc": [
                      "America/Belize",
                      "America/Costa_Rica",
                      "America/El_Salvador",
                      "America/Guatemala",
                      "America/Managua",
                      "America/Tegucigalpa",
                      "Etc/GMT+6",
                      "Pacific/Galapagos"
                    ]
                  },
                  {
                    "name": "Central Standard Time",
                    "abbr": "CDT",
                    "offset": -5,
                    "isdst": true,
                    "text": "(UTC-06:00) Central Time (US & Canada)",
                    "utc": [
                      "America/Chicago",
                      "America/Indiana/Knox",
                      "America/Indiana/Tell_City",
                      "America/Matamoros",
                      "America/Menominee",
                      "America/North_Dakota/Beulah",
                      "America/North_Dakota/Center",
                      "America/North_Dakota/New_Salem",
                      "America/Rainy_River",
                      "America/Rankin_Inlet",
                      "America/Resolute",
                      "America/Winnipeg",
                      "CST6CDT"
                    ]
                  },
                  {
                    "name": "Central Standard Time (Mexico)",
                    "abbr": "CDT",
                    "offset": -5,
                    "isdst": true,
                    "text": "(UTC-06:00) Guadalajara, Mexico City, Monterrey",
                    "utc": [
                      "America/Bahia_Banderas",
                      "America/Cancun",
                      "America/Merida",
                      "America/Mexico_City",
                      "America/Monterrey"
                    ]
                  },
                  {
                    "name": "Canada Central Standard Time",
                    "abbr": "CCST",
                    "offset": -6,
                    "isdst": false,
                    "text": "(UTC-06:00) Saskatchewan",
                    "utc": [
                      "America/Regina",
                      "America/Swift_Current"
                    ]
                  },
                  {
                    "name": "SA Pacific Standard Time",
                    "abbr": "SPST",
                    "offset": -5,
                    "isdst": false,
                    "text": "(UTC-05:00) Bogota, Lima, Quito",
                    "utc": [
                      "America/Bogota",
                      "America/Cayman",
                      "America/Coral_Harbour",
                      "America/Eirunepe",
                      "America/Guayaquil",
                      "America/Jamaica",
                      "America/Lima",
                      "America/Panama",
                      "America/Rio_Branco",
                      "Etc/GMT+5"
                    ]
                  },
                  {
                    "name": "Eastern Standard Time",
                    "abbr": "EDT",
                    "offset": -4,
                    "isdst": true,
                    "text": "(UTC-05:00) Eastern Time (US & Canada)",
                    "utc": [
                      "America/Detroit",
                      "America/Havana",
                      "America/Indiana/Petersburg",
                      "America/Indiana/Vincennes",
                      "America/Indiana/Winamac",
                      "America/Iqaluit",
                      "America/Kentucky/Monticello",
                      "America/Louisville",
                      "America/Montreal",
                      "America/Nassau",
                      "America/New_York",
                      "America/Nipigon",
                      "America/Pangnirtung",
                      "America/Port-au-Prince",
                      "America/Thunder_Bay",
                      "America/Toronto",
                      "EST5EDT"
                    ]
                  },
                  {
                    "name": "US Eastern Standard Time",
                    "abbr": "UEDT",
                    "offset": -4,
                    "isdst": true,
                    "text": "(UTC-05:00) Indiana (East)",
                    "utc": [
                      "America/Indiana/Marengo",
                      "America/Indiana/Vevay",
                      "America/Indianapolis"
                    ]
                  },
                  {
                    "name": "Venezuela Standard Time",
                    "abbr": "VST",
                    "offset": -4.5,
                    "isdst": false,
                    "text": "(UTC-04:30) Caracas",
                    "utc": [
                      "America/Caracas"
                    ]
                  },
                  {
                    "name": "Paraguay Standard Time",
                    "abbr": "PST",
                    "offset": -4,
                    "isdst": false,
                    "text": "(UTC-04:00) Asuncion",
                    "utc": [
                      "America/Asuncion"
                    ]
                  },
                  {
                    "name": "Atlantic Standard Time",
                    "abbr": "ADT",
                    "offset": -3,
                    "isdst": true,
                    "text": "(UTC-04:00) Atlantic Time (Canada)",
                    "utc": [
                      "America/Glace_Bay",
                      "America/Goose_Bay",
                      "America/Halifax",
                      "America/Moncton",
                      "America/Thule",
                      "Atlantic/Bermuda"
                    ]
                  },
                  {
                    "name": "Central Brazilian Standard Time",
                    "abbr": "CBST",
                    "offset": -4,
                    "isdst": false,
                    "text": "(UTC-04:00) Cuiaba",
                    "utc": [
                      "America/Campo_Grande",
                      "America/Cuiaba"
                    ]
                  },
                  {
                    "name": "SA Western Standard Time",
                    "abbr": "SWST",
                    "offset": -4,
                    "isdst": false,
                    "text": "(UTC-04:00) Georgetown, La Paz, Manaus, San Juan",
                    "utc": [
                      "America/Anguilla",
                      "America/Antigua",
                      "America/Aruba",
                      "America/Barbados",
                      "America/Blanc-Sablon",
                      "America/Boa_Vista",
                      "America/Curacao",
                      "America/Dominica",
                      "America/Grand_Turk",
                      "America/Grenada",
                      "America/Guadeloupe",
                      "America/Guyana",
                      "America/Kralendijk",
                      "America/La_Paz",
                      "America/Lower_Princes",
                      "America/Manaus",
                      "America/Marigot",
                      "America/Martinique",
                      "America/Montserrat",
                      "America/Port_of_Spain",
                      "America/Porto_Velho",
                      "America/Puerto_Rico",
                      "America/Santo_Domingo",
                      "America/St_Barthelemy",
                      "America/St_Kitts",
                      "America/St_Lucia",
                      "America/St_Thomas",
                      "America/St_Vincent",
                      "America/Tortola",
                      "Etc/GMT+4"
                    ]
                  },
                  {
                    "name": "Pacific SA Standard Time",
                    "abbr": "PSST",
                    "offset": -4,
                    "isdst": false,
                    "text": "(UTC-04:00) Santiago",
                    "utc": [
                      "America/Santiago",
                      "Antarctica/Palmer"
                    ]
                  },
                  {
                    "name": "Newfoundland Standard Time",
                    "abbr": "NDT",
                    "offset": -2.5,
                    "isdst": true,
                    "text": "(UTC-03:30) Newfoundland",
                    "utc": [
                      "America/St_Johns"
                    ]
                  },
                  {
                    "name": "E. South America Standard Time",
                    "abbr": "ESAST",
                    "offset": -3,
                    "isdst": false,
                    "text": "(UTC-03:00) Brasilia",
                    "utc": [
                      "America/Sao_Paulo"
                    ]
                  },
                  {
                    "name": "Argentina Standard Time",
                    "abbr": "AST",
                    "offset": -3,
                    "isdst": false,
                    "text": "(UTC-03:00) Buenos Aires",
                    "utc": [
                      "America/Argentina/La_Rioja",
                      "America/Argentina/Rio_Gallegos",
                      "America/Argentina/Salta",
                      "America/Argentina/San_Juan",
                      "America/Argentina/San_Luis",
                      "America/Argentina/Tucuman",
                      "America/Argentina/Ushuaia",
                      "America/Buenos_Aires",
                      "America/Catamarca",
                      "America/Cordoba",
                      "America/Jujuy",
                      "America/Mendoza"
                    ]
                  },
                  {
                    "name": "SA Eastern Standard Time",
                    "abbr": "SEST",
                    "offset": -3,
                    "isdst": false,
                    "text": "(UTC-03:00) Cayenne, Fortaleza",
                    "utc": [
                      "America/Araguaina",
                      "America/Belem",
                      "America/Cayenne",
                      "America/Fortaleza",
                      "America/Maceio",
                      "America/Paramaribo",
                      "America/Recife",
                      "America/Santarem",
                      "Antarctica/Rothera",
                      "Atlantic/Stanley",
                      "Etc/GMT+3"
                    ]
                  },
                  {
                    "name": "Greenland Standard Time",
                    "abbr": "GDT",
                    "offset": -2,
                    "isdst": true,
                    "text": "(UTC-03:00) Greenland",
                    "utc": [
                      "America/Godthab"
                    ]
                  },
                  {
                    "name": "Montevideo Standard Time",
                    "abbr": "MST",
                    "offset": -3,
                    "isdst": false,
                    "text": "(UTC-03:00) Montevideo",
                    "utc": [
                      "America/Montevideo"
                    ]
                  },
                  {
                    "name": "Bahia Standard Time",
                    "abbr": "BST",
                    "offset": -3,
                    "isdst": false,
                    "text": "(UTC-03:00) Salvador",
                    "utc": [
                      "America/Bahia"
                    ]
                  },
                  {
                    "name": "UTC-02",
                    "abbr": "U",
                    "offset": -2,
                    "isdst": false,
                    "text": "(UTC-02:00) Coordinated Universal Time-02",
                    "utc": [
                      "America/Noronha",
                      "Atlantic/South_Georgia",
                      "Etc/GMT+2"
                    ]
                  },
                  {
                    "name": "Mid-Atlantic Standard Time",
                    "abbr": "MDT",
                    "offset": -1,
                    "isdst": true,
                    "text": "(UTC-02:00) Mid-Atlantic - Old"
                  },
                  {
                    "name": "Azores Standard Time",
                    "abbr": "ADT",
                    "offset": 0,
                    "isdst": true,
                    "text": "(UTC-01:00) Azores",
                    "utc": [
                      "America/Scoresbysund",
                      "Atlantic/Azores"
                    ]
                  },
                  {
                    "name": "Cape Verde Standard Time",
                    "abbr": "CVST",
                    "offset": -1,
                    "isdst": false,
                    "text": "(UTC-01:00) Cape Verde Is.",
                    "utc": [
                      "Atlantic/Cape_Verde",
                      "Etc/GMT+1"
                    ]
                  },
                  {
                    "name": "Morocco Standard Time",
                    "abbr": "MDT",
                    "offset": 1,
                    "isdst": true,
                    "text": "(UTC) Casablanca",
                    "utc": [
                      "Africa/Casablanca",
                      "Africa/El_Aaiun"
                    ]
                  },
                  {
                    "name": "UTC",
                    "abbr": "CUT",
                    "offset": 0,
                    "isdst": false,
                    "text": "(UTC) Coordinated Universal Time",
                    "utc": [
                      "America/Danmarkshavn",
                      "Etc/GMT"
                    ]
                  },
                  {
                    "name": "GMT Standard Time",
                    "abbr": "GDT",
                    "offset": 1,
                    "isdst": true,
                    "text": "(UTC) Dublin, Edinburgh, Lisbon, London",
                    "utc": [
                      "Atlantic/Canary",
                      "Atlantic/Faeroe",
                      "Atlantic/Madeira",
                      "Europe/Dublin",
                      "Europe/Guernsey",
                      "Europe/Isle_of_Man",
                      "Europe/Jersey",
                      "Europe/Lisbon",
                      "Europe/London"
                    ]
                  },
                  {
                    "name": "Greenwich Standard Time",
                    "abbr": "GST",
                    "offset": 0,
                    "isdst": false,
                    "text": "(UTC) Monrovia, Reykjavik",
                    "utc": [
                      "Africa/Abidjan",
                      "Africa/Accra",
                      "Africa/Bamako",
                      "Africa/Banjul",
                      "Africa/Bissau",
                      "Africa/Conakry",
                      "Africa/Dakar",
                      "Africa/Freetown",
                      "Africa/Lome",
                      "Africa/Monrovia",
                      "Africa/Nouakchott",
                      "Africa/Ouagadougou",
                      "Africa/Sao_Tome",
                      "Atlantic/Reykjavik",
                      "Atlantic/St_Helena"
                    ]
                  },
                  {
                    "name": "W. Europe Standard Time",
                    "abbr": "WEDT",
                    "offset": 2,
                    "isdst": true,
                    "text": "(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna",
                    "utc": [
                      "Arctic/Longyearbyen",
                      "Europe/Amsterdam",
                      "Europe/Andorra",
                      "Europe/Berlin",
                      "Europe/Busingen",
                      "Europe/Gibraltar",
                      "Europe/Luxembourg",
                      "Europe/Malta",
                      "Europe/Monaco",
                      "Europe/Oslo",
                      "Europe/Rome",
                      "Europe/San_Marino",
                      "Europe/Stockholm",
                      "Europe/Vaduz",
                      "Europe/Vatican",
                      "Europe/Vienna",
                      "Europe/Zurich"
                    ]
                  },
                  {
                    "name": "Central Europe Standard Time",
                    "abbr": "CEDT",
                    "offset": 2,
                    "isdst": true,
                    "text": "(UTC+01:00) Belgrade, Bratislava, Budapest, Ljubljana, Prague",
                    "utc": [
                      "Europe/Belgrade",
                      "Europe/Bratislava",
                      "Europe/Budapest",
                      "Europe/Ljubljana",
                      "Europe/Podgorica",
                      "Europe/Prague",
                      "Europe/Tirane"
                    ]
                  },
                  {
                    "name": "Romance Standard Time",
                    "abbr": "RDT",
                    "offset": 2,
                    "isdst": true,
                    "text": "(UTC+01:00) Brussels, Copenhagen, Madrid, Paris",
                    "utc": [
                      "Africa/Ceuta",
                      "Europe/Brussels",
                      "Europe/Copenhagen",
                      "Europe/Madrid",
                      "Europe/Paris"
                    ]
                  },
                  {
                    "name": "Central European Standard Time",
                    "abbr": "CEDT",
                    "offset": 2,
                    "isdst": true,
                    "text": "(UTC+01:00) Sarajevo, Skopje, Warsaw, Zagreb",
                    "utc": [
                      "Europe/Sarajevo",
                      "Europe/Skopje",
                      "Europe/Warsaw",
                      "Europe/Zagreb"
                    ]
                  },
                  {
                    "name": "W. Central Africa Standard Time",
                    "abbr": "WCAST",
                    "offset": 1,
                    "isdst": false,
                    "text": "(UTC+01:00) West Central Africa",
                    "utc": [
                      "Africa/Algiers",
                      "Africa/Bangui",
                      "Africa/Brazzaville",
                      "Africa/Douala",
                      "Africa/Kinshasa",
                      "Africa/Lagos",
                      "Africa/Libreville",
                      "Africa/Luanda",
                      "Africa/Malabo",
                      "Africa/Ndjamena",
                      "Africa/Niamey",
                      "Africa/Porto-Novo",
                      "Africa/Tunis",
                      "Etc/GMT-1"
                    ]
                  },
                  {
                    "name": "Namibia Standard Time",
                    "abbr": "NST",
                    "offset": 1,
                    "isdst": false,
                    "text": "(UTC+01:00) Windhoek",
                    "utc": [
                      "Africa/Windhoek"
                    ]
                  },
                  {
                    "name": "GTB Standard Time",
                    "abbr": "GDT",
                    "offset": 3,
                    "isdst": true,
                    "text": "(UTC+02:00) Athens, Bucharest",
                    "utc": [
                      "Asia/Nicosia",
                      "Europe/Athens",
                      "Europe/Bucharest",
                      "Europe/Chisinau"
                    ]
                  },
                  {
                    "name": "Middle East Standard Time",
                    "abbr": "MEDT",
                    "offset": 3,
                    "isdst": true,
                    "text": "(UTC+02:00) Beirut",
                    "utc": [
                      "Asia/Beirut"
                    ]
                  },
                  {
                    "name": "Egypt Standard Time",
                    "abbr": "EST",
                    "offset": 2,
                    "isdst": false,
                    "text": "(UTC+02:00) Cairo",
                    "utc": [
                      "Africa/Cairo"
                    ]
                  },
                  {
                    "name": "Syria Standard Time",
                    "abbr": "SDT",
                    "offset": 3,
                    "isdst": true,
                    "text": "(UTC+02:00) Damascus",
                    "utc": [
                      "Asia/Damascus"
                    ]
                  },
                  {
                    "name": "E. Europe Standard Time",
                    "abbr": "EEDT",
                    "offset": 3,
                    "isdst": true,
                    "text": "(UTC+02:00) E. Europe"
                  },
                  {
                    "name": "South Africa Standard Time",
                    "abbr": "SAST",
                    "offset": 2,
                    "isdst": false,
                    "text": "(UTC+02:00) Harare, Pretoria",
                    "utc": [
                      "Africa/Blantyre",
                      "Africa/Bujumbura",
                      "Africa/Gaborone",
                      "Africa/Harare",
                      "Africa/Johannesburg",
                      "Africa/Kigali",
                      "Africa/Lubumbashi",
                      "Africa/Lusaka",
                      "Africa/Maputo",
                      "Africa/Maseru",
                      "Africa/Mbabane",
                      "Etc/GMT-2"
                    ]
                  },
                  {
                    "name": "FLE Standard Time",
                    "abbr": "FDT",
                    "offset": 3,
                    "isdst": true,
                    "text": "(UTC+02:00) Helsinki, Kyiv, Riga, Sofia, Tallinn, Vilnius",
                    "utc": [
                      "Europe/Helsinki",
                      "Europe/Kiev",
                      "Europe/Mariehamn",
                      "Europe/Riga",
                      "Europe/Sofia",
                      "Europe/Tallinn",
                      "Europe/Uzhgorod",
                      "Europe/Vilnius",
                      "Europe/Zaporozhye"
                    ]
                  },
                  {
                    "name": "Turkey Standard Time",
                    "abbr": "TDT",
                    "offset": 3,
                    "isdst": true,
                    "text": "(UTC+02:00) Istanbul",
                    "utc": [
                      "Europe/Istanbul"
                    ]
                  },
                  {
                    "name": "Israel Standard Time",
                    "abbr": "JDT",
                    "offset": 3,
                    "isdst": true,
                    "text": "(UTC+02:00) Jerusalem",
                    "utc": [
                      "Asia/Jerusalem"
                    ]
                  },
                  {
                    "name": "Libya Standard Time",
                    "abbr": "LST",
                    "offset": 2,
                    "isdst": false,
                    "text": "(UTC+02:00) Tripoli",
                    "utc": [
                      "Africa/Tripoli"
                    ]
                  },
                  {
                    "name": "Jordan Standard Time",
                    "abbr": "JST",
                    "offset": 3,
                    "isdst": false,
                    "text": "(UTC+03:00) Amman",
                    "utc": [
                      "Asia/Amman"
                    ]
                  },
                  {
                    "name": "Arabic Standard Time",
                    "abbr": "AST",
                    "offset": 3,
                    "isdst": false,
                    "text": "(UTC+03:00) Baghdad",
                    "utc": [
                      "Asia/Baghdad"
                    ]
                  },
                  {
                    "name": "Kaliningrad Standard Time",
                    "abbr": "KST",
                    "offset": 3,
                    "isdst": false,
                    "text": "(UTC+03:00) Kaliningrad, Minsk",
                    "utc": [
                      "Europe/Kaliningrad",
                      "Europe/Minsk"
                    ]
                  },
                  {
                    "name": "Arab Standard Time",
                    "abbr": "AST",
                    "offset": 3,
                    "isdst": false,
                    "text": "(UTC+03:00) Kuwait, Riyadh",
                    "utc": [
                      "Asia/Aden",
                      "Asia/Bahrain",
                      "Asia/Kuwait",
                      "Asia/Qatar",
                      "Asia/Riyadh"
                    ]
                  },
                  {
                    "name": "E. Africa Standard Time",
                    "abbr": "EAST",
                    "offset": 3,
                    "isdst": false,
                    "text": "(UTC+03:00) Nairobi",
                    "utc": [
                      "Africa/Addis_Ababa",
                      "Africa/Asmera",
                      "Africa/Dar_es_Salaam",
                      "Africa/Djibouti",
                      "Africa/Juba",
                      "Africa/Kampala",
                      "Africa/Khartoum",
                      "Africa/Mogadishu",
                      "Africa/Nairobi",
                      "Antarctica/Syowa",
                      "Etc/GMT-3",
                      "Indian/Antananarivo",
                      "Indian/Comoro",
                      "Indian/Mayotte"
                    ]
                  },
                  {
                    "name": "Iran Standard Time",
                    "abbr": "IDT",
                    "offset": 4.5,
                    "isdst": true,
                    "text": "(UTC+03:30) Tehran",
                    "utc": [
                      "Asia/Tehran"
                    ]
                  },
                  {
                    "name": "Arabian Standard Time",
                    "abbr": "AST",
                    "offset": 4,
                    "isdst": false,
                    "text": "(UTC+04:00) Abu Dhabi, Muscat",
                    "utc": [
                      "Asia/Dubai",
                      "Asia/Muscat",
                      "Etc/GMT-4"
                    ]
                  },
                  {
                    "name": "Azerbaijan Standard Time",
                    "abbr": "ADT",
                    "offset": 5,
                    "isdst": true,
                    "text": "(UTC+04:00) Baku",
                    "utc": [
                      "Asia/Baku"
                    ]
                  },
                  {
                    "name": "Russian Standard Time",
                    "abbr": "RST",
                    "offset": 4,
                    "isdst": false,
                    "text": "(UTC+04:00) Moscow, St. Petersburg, Volgograd",
                    "utc": [
                      "Europe/Moscow",
                      "Europe/Samara",
                      "Europe/Simferopol",
                      "Europe/Volgograd"
                    ]
                  },
                  {
                    "name": "Mauritius Standard Time",
                    "abbr": "MST",
                    "offset": 4,
                    "isdst": false,
                    "text": "(UTC+04:00) Port Louis",
                    "utc": [
                      "Indian/Mahe",
                      "Indian/Mauritius",
                      "Indian/Reunion"
                    ]
                  },
                  {
                    "name": "Georgian Standard Time",
                    "abbr": "GST",
                    "offset": 4,
                    "isdst": false,
                    "text": "(UTC+04:00) Tbilisi",
                    "utc": [
                      "Asia/Tbilisi"
                    ]
                  },
                  {
                    "name": "Caucasus Standard Time",
                    "abbr": "CST",
                    "offset": 4,
                    "isdst": false,
                    "text": "(UTC+04:00) Yerevan",
                    "utc": [
                      "Asia/Yerevan"
                    ]
                  },
                  {
                    "name": "Afghanistan Standard Time",
                    "abbr": "AST",
                    "offset": 4.5,
                    "isdst": false,
                    "text": "(UTC+04:30) Kabul",
                    "utc": [
                      "Asia/Kabul"
                    ]
                  },
                  {
                    "name": "West Asia Standard Time",
                    "abbr": "WAST",
                    "offset": 5,
                    "isdst": false,
                    "text": "(UTC+05:00) Ashgabat, Tashkent",
                    "utc": [
                      "Antarctica/Mawson",
                      "Asia/Aqtau",
                      "Asia/Aqtobe",
                      "Asia/Ashgabat",
                      "Asia/Dushanbe",
                      "Asia/Oral",
                      "Asia/Samarkand",
                      "Asia/Tashkent",
                      "Etc/GMT-5",
                      "Indian/Kerguelen",
                      "Indian/Maldives"
                    ]
                  },
                  {
                    "name": "Pakistan Standard Time",
                    "abbr": "PST",
                    "offset": 5,
                    "isdst": false,
                    "text": "(UTC+05:00) Islamabad, Karachi",
                    "utc": [
                      "Asia/Karachi"
                    ]
                  },
                  {
                    "name": "India Standard Time",
                    "abbr": "IST",
                    "offset": 5.5,
                    "isdst": false,
                    "text": "(UTC+05:30) Chennai, Kolkata, Mumbai, New Delhi",
                    "utc": [
                      "Asia/Calcutta"
                    ]
                  },
                  {
                    "name": "Sri Lanka Standard Time",
                    "abbr": "SLST",
                    "offset": 5.5,
                    "isdst": false,
                    "text": "(UTC+05:30) Sri Jayawardenepura",
                    "utc": [
                      "Asia/Colombo"
                    ]
                  },
                  {
                    "name": "Nepal Standard Time",
                    "abbr": "NST",
                    "offset": 5.75,
                    "isdst": false,
                    "text": "(UTC+05:45) Kathmandu",
                    "utc": [
                      "Asia/Katmandu"
                    ]
                  },
                  {
                    "name": "Central Asia Standard Time",
                    "abbr": "CAST",
                    "offset": 6,
                    "isdst": false,
                    "text": "(UTC+06:00) Astana",
                    "utc": [
                      "Antarctica/Vostok",
                      "Asia/Almaty",
                      "Asia/Bishkek",
                      "Asia/Qyzylorda",
                      "Asia/Urumqi",
                      "Etc/GMT-6",
                      "Indian/Chagos"
                    ]
                  },
                  {
                    "name": "Bangladesh Standard Time",
                    "abbr": "BST",
                    "offset": 6,
                    "isdst": false,
                    "text": "(UTC+06:00) Dhaka",
                    "utc": [
                      "Asia/Dhaka",
                      "Asia/Thimphu"
                    ]
                  },
                  {
                    "name": "Ekaterinburg Standard Time",
                    "abbr": "EST",
                    "offset": 6,
                    "isdst": false,
                    "text": "(UTC+06:00) Ekaterinburg",
                    "utc": [
                      "Asia/Yekaterinburg"
                    ]
                  },
                  {
                    "name": "Myanmar Standard Time",
                    "abbr": "MST",
                    "offset": 6.5,
                    "isdst": false,
                    "text": "(UTC+06:30) Yangon (Rangoon)",
                    "utc": [
                      "Asia/Rangoon",
                      "Indian/Cocos"
                    ]
                  },
                  {
                    "name": "SE Asia Standard Time",
                    "abbr": "SAST",
                    "offset": 7,
                    "isdst": false,
                    "text": "(UTC+07:00) Bangkok, Hanoi, Jakarta",
                    "utc": [
                      "Antarctica/Davis",
                      "Asia/Bangkok",
                      "Asia/Hovd",
                      "Asia/Jakarta",
                      "Asia/Phnom_Penh",
                      "Asia/Pontianak",
                      "Asia/Saigon",
                      "Asia/Vientiane",
                      "Etc/GMT-7",
                      "Indian/Christmas"
                    ]
                  },
                  {
                    "name": "N. Central Asia Standard Time",
                    "abbr": "NCAST",
                    "offset": 7,
                    "isdst": false,
                    "text": "(UTC+07:00) Novosibirsk",
                    "utc": [
                      "Asia/Novokuznetsk",
                      "Asia/Novosibirsk",
                      "Asia/Omsk"
                    ]
                  },
                  {
                    "name": "China Standard Time",
                    "abbr": "CST",
                    "offset": 8,
                    "isdst": false,
                    "text": "(UTC+08:00) Beijing, Chongqing, Hong Kong, Urumqi",
                    "utc": [
                      "Asia/Hong_Kong",
                      "Asia/Macau",
                      "Asia/Shanghai"
                    ]
                  },
                  {
                    "name": "North Asia Standard Time",
                    "abbr": "NAST",
                    "offset": 8,
                    "isdst": false,
                    "text": "(UTC+08:00) Krasnoyarsk",
                    "utc": [
                      "Asia/Krasnoyarsk"
                    ]
                  },
                  {
                    "name": "Singapore Standard Time",
                    "abbr": "MPST",
                    "offset": 8,
                    "isdst": false,
                    "text": "(UTC+08:00) Kuala Lumpur, Singapore",
                    "utc": [
                      "Asia/Brunei",
                      "Asia/Kuala_Lumpur",
                      "Asia/Kuching",
                      "Asia/Makassar",
                      "Asia/Manila",
                      "Asia/Singapore",
                      "Etc/GMT-8"
                    ]
                  },
                  {
                    "name": "W. Australia Standard Time",
                    "abbr": "WAST",
                    "offset": 8,
                    "isdst": false,
                    "text": "(UTC+08:00) Perth",
                    "utc": [
                      "Antarctica/Casey",
                      "Australia/Perth"
                    ]
                  },
                  {
                    "name": "Taipei Standard Time",
                    "abbr": "TST",
                    "offset": 8,
                    "isdst": false,
                    "text": "(UTC+08:00) Taipei",
                    "utc": [
                      "Asia/Taipei"
                    ]
                  },
                  {
                    "name": "Ulaanbaatar Standard Time",
                    "abbr": "UST",
                    "offset": 8,
                    "isdst": false,
                    "text": "(UTC+08:00) Ulaanbaatar",
                    "utc": [
                      "Asia/Choibalsan",
                      "Asia/Ulaanbaatar"
                    ]
                  },
                  {
                    "name": "North Asia East Standard Time",
                    "abbr": "NAEST",
                    "offset": 9,
                    "isdst": false,
                    "text": "(UTC+09:00) Irkutsk",
                    "utc": [
                      "Asia/Irkutsk"
                    ]
                  },
                  {
                    "name": "Tokyo Standard Time",
                    "abbr": "TST",
                    "offset": 9,
                    "isdst": false,
                    "text": "(UTC+09:00) Osaka, Sapporo, Tokyo",
                    "utc": [
                      "Asia/Dili",
                      "Asia/Jayapura",
                      "Asia/Tokyo",
                      "Etc/GMT-9",
                      "Pacific/Palau"
                    ]
                  },
                  {
                    "name": "Korea Standard Time",
                    "abbr": "KST",
                    "offset": 9,
                    "isdst": false,
                    "text": "(UTC+09:00) Seoul",
                    "utc": [
                      "Asia/Pyongyang",
                      "Asia/Seoul"
                    ]
                  },
                  {
                    "name": "Cen. Australia Standard Time",
                    "abbr": "CAST",
                    "offset": 9.5,
                    "isdst": false,
                    "text": "(UTC+09:30) Adelaide",
                    "utc": [
                      "Australia/Adelaide",
                      "Australia/Broken_Hill"
                    ]
                  },
                  {
                    "name": "AUS Central Standard Time",
                    "abbr": "ACST",
                    "offset": 9.5,
                    "isdst": false,
                    "text": "(UTC+09:30) Darwin",
                    "utc": [
                      "Australia/Darwin"
                    ]
                  },
                  {
                    "name": "E. Australia Standard Time",
                    "abbr": "EAST",
                    "offset": 10,
                    "isdst": false,
                    "text": "(UTC+10:00) Brisbane",
                    "utc": [
                      "Australia/Brisbane",
                      "Australia/Lindeman"
                    ]
                  },
                  {
                    "name": "AUS Eastern Standard Time",
                    "abbr": "AEST",
                    "offset": 10,
                    "isdst": false,
                    "text": "(UTC+10:00) Canberra, Melbourne, Sydney",
                    "utc": [
                      "Australia/Melbourne",
                      "Australia/Sydney"
                    ]
                  },
                  {
                    "name": "West Pacific Standard Time",
                    "abbr": "WPST",
                    "offset": 10,
                    "isdst": false,
                    "text": "(UTC+10:00) Guam, Port Moresby",
                    "utc": [
                      "Antarctica/DumontDUrville",
                      "Etc/GMT-10",
                      "Pacific/Guam",
                      "Pacific/Port_Moresby",
                      "Pacific/Saipan",
                      "Pacific/Truk"
                    ]
                  },
                  {
                    "name": "Tasmania Standard Time",
                    "abbr": "TST",
                    "offset": 10,
                    "isdst": false,
                    "text": "(UTC+10:00) Hobart",
                    "utc": [
                      "Australia/Currie",
                      "Australia/Hobart"
                    ]
                  },
                  {
                    "name": "Yakutsk Standard Time",
                    "abbr": "YST",
                    "offset": 10,
                    "isdst": false,
                    "text": "(UTC+10:00) Yakutsk",
                    "utc": [
                      "Asia/Chita",
                      "Asia/Khandyga",
                      "Asia/Yakutsk"
                    ]
                  },
                  {
                    "name": "Central Pacific Standard Time",
                    "abbr": "CPST",
                    "offset": 11,
                    "isdst": false,
                    "text": "(UTC+11:00) Solomon Is., New Caledonia",
                    "utc": [
                      "Antarctica/Macquarie",
                      "Etc/GMT-11",
                      "Pacific/Efate",
                      "Pacific/Guadalcanal",
                      "Pacific/Kosrae",
                      "Pacific/Noumea",
                      "Pacific/Ponape"
                    ]
                  },
                  {
                    "name": "Vladivostok Standard Time",
                    "abbr": "VST",
                    "offset": 11,
                    "isdst": false,
                    "text": "(UTC+11:00) Vladivostok",
                    "utc": [
                      "Asia/Sakhalin",
                      "Asia/Ust-Nera",
                      "Asia/Vladivostok"
                    ]
                  },
                  {
                    "name": "New Zealand Standard Time",
                    "abbr": "NZST",
                    "offset": 12,
                    "isdst": false,
                    "text": "(UTC+12:00) Auckland, Wellington",
                    "utc": [
                      "Antarctica/McMurdo",
                      "Pacific/Auckland"
                    ]
                  },
                  {
                    "name": "UTC+12",
                    "abbr": "U",
                    "offset": 12,
                    "isdst": false,
                    "text": "(UTC+12:00) Coordinated Universal Time+12",
                    "utc": [
                      "Etc/GMT-12",
                      "Pacific/Funafuti",
                      "Pacific/Kwajalein",
                      "Pacific/Majuro",
                      "Pacific/Nauru",
                      "Pacific/Tarawa",
                      "Pacific/Wake",
                      "Pacific/Wallis"
                    ]
                  },
                  {
                    "name": "Fiji Standard Time",
                    "abbr": "FST",
                    "offset": 12,
                    "isdst": false,
                    "text": "(UTC+12:00) Fiji",
                    "utc": [
                      "Pacific/Fiji"
                    ]
                  },
                  {
                    "name": "Magadan Standard Time",
                    "abbr": "MST",
                    "offset": 12,
                    "isdst": false,
                    "text": "(UTC+12:00) Magadan",
                    "utc": [
                      "Asia/Anadyr",
                      "Asia/Kamchatka",
                      "Asia/Magadan",
                      "Asia/Srednekolymsk"
                    ]
                  },
                  {
                    "name": "Kamchatka Standard Time",
                    "abbr": "KDT",
                    "offset": 13,
                    "isdst": true,
                    "text": "(UTC+12:00) Petropavlovsk-Kamchatsky - Old"
                  },
                  {
                    "name": "Tonga Standard Time",
                    "abbr": "TST",
                    "offset": 13,
                    "isdst": false,
                    "text": "(UTC+13:00) Nuku'alofa",
                    "utc": [
                      "Etc/GMT-13",
                      "Pacific/Enderbury",
                      "Pacific/Fakaofo",
                      "Pacific/Tongatapu"
                    ]
                  },
                  {
                    "name": "Samoa Standard Time",
                    "abbr": "SST",
                    "offset": 13,
                    "isdst": false,
                    "text": "(UTC+13:00) Samoa",
                    "utc": [
                      "Pacific/Apia"
                    ]
                  }
                ]
    };

    var o_hasOwnProperty = Object.prototype.hasOwnProperty;
    var o_keys = (Object.keys || function(obj) {
      var result = [];
      for (var key in obj) {
        if (o_hasOwnProperty.call(obj, key)) {
          result.push(key);
        }
      }

      return result;
    });

    function _copyObject(source, target) {
      var keys = o_keys(source);
      var key;

      for (var i = 0, l = keys.length; i < l; i++) {
        key = keys[i];
        target[key] = source[key] || target[key];
      }
    }

    function _copyArray(source, target) {
      for (var i = 0, l = source.length; i < l; i++) {
        target[i] = source[i];
      }
    }

    function copyObject(source, _target) {
        var isArray = Array.isArray(source);
        var target = _target || (isArray ? new Array(source.length) : {});

        if (isArray) {
          _copyArray(source, target);
        } else {
          _copyObject(source, target);
        }

        return target;
    }

    /** Get the data based on key**/
    Chance.prototype.get = function (name) {
        return copyObject(data[name]);
    };

    // Mac Address
    Chance.prototype.mac_address = function(options){
        // typically mac addresses are separated by ":"
        // however they can also be separated by "-"
        // the network variant uses a dot every fourth byte

        options = initOptions(options);
        if(!options.separator) {
            options.separator =  options.networkVersion ? "." : ":";
        }

        var mac_pool="ABCDEF1234567890",
            mac = "";
        if(!options.networkVersion) {
            mac = this.n(this.string, 6, { pool: mac_pool, length:2 }).join(options.separator);
        } else {
            mac = this.n(this.string, 3, { pool: mac_pool, length:4 }).join(options.separator);
        }

        return mac;
    };

    Chance.prototype.normal = function (options) {
        options = initOptions(options, {mean : 0, dev : 1, pool : []});

        testRange(
            options.pool.constructor !== Array,
            "Chance: The pool option must be a valid array."
        );

        // If a pool has been passed, then we are returning an item from that pool,
        // using the normal distribution settings that were passed in
        if (options.pool.length > 0) {
            return this.normal_pool(options);
        }

        // The Marsaglia Polar method
        var s, u, v, norm,
            mean = options.mean,
            dev = options.dev;

        do {
            // U and V are from the uniform distribution on (-1, 1)
            u = this.random() * 2 - 1;
            v = this.random() * 2 - 1;

            s = u * u + v * v;
        } while (s >= 1);

        // Compute the standard normal variate
        norm = u * Math.sqrt(-2 * Math.log(s) / s);

        // Shape and scale
        return dev * norm + mean;
    };

    Chance.prototype.normal_pool = function(options) {
        var performanceCounter = 0;
        do {
            var idx = Math.round(this.normal({ mean: options.mean, dev: options.dev }));
            if (idx < options.pool.length && idx >= 0) {
                return options.pool[idx];
            } else {
                performanceCounter++;
            }
        } while(performanceCounter < 100);

        throw new RangeError("Chance: Your pool is too small for the given mean and standard deviation. Please adjust.");
    };

    Chance.prototype.radio = function (options) {
        // Initial Letter (Typically Designated by Side of Mississippi River)
        options = initOptions(options, {side : "?"});
        var fl = "";
        switch (options.side.toLowerCase()) {
        case "east":
        case "e":
            fl = "W";
            break;
        case "west":
        case "w":
            fl = "K";
            break;
        default:
            fl = this.character({pool: "KW"});
            break;
        }

        return fl + this.character({alpha: true, casing: "upper"}) +
                this.character({alpha: true, casing: "upper"}) +
                this.character({alpha: true, casing: "upper"});
    };

    // Set the data as key and data or the data map
    Chance.prototype.set = function (name, values) {
        if (typeof name === "string") {
            data[name] = values;
        } else {
            data = copyObject(name, data);
        }
    };

    Chance.prototype.tv = function (options) {
        return this.radio(options);
    };

    // ID number for Brazil companies
    Chance.prototype.cnpj = function () {
        var n = this.n(this.natural, 8, { max: 9 });
        var d1 = 2+n[7]*6+n[6]*7+n[5]*8+n[4]*9+n[3]*2+n[2]*3+n[1]*4+n[0]*5;
        d1 = 11 - (d1 % 11);
        if (d1>=10){
            d1 = 0;
        }
        var d2 = d1*2+3+n[7]*7+n[6]*8+n[5]*9+n[4]*2+n[3]*3+n[2]*4+n[1]*5+n[0]*6;
        d2 = 11 - (d2 % 11);
        if (d2>=10){
            d2 = 0;
        }
        return ''+n[0]+n[1]+'.'+n[2]+n[3]+n[4]+'.'+n[5]+n[6]+n[7]+'/0001-'+d1+d2;
    };

    // -- End Miscellaneous --

    Chance.prototype.mersenne_twister = function (seed) {
        return new MersenneTwister(seed);
    };

    Chance.prototype.blueimp_md5 = function () {
        return new BlueImpMD5();
    };

    // Mersenne Twister from https://gist.github.com/banksean/300494
    var MersenneTwister = function (seed) {
        if (seed === undefined) {
            // kept random number same size as time used previously to ensure no unexpected results downstream
            seed = Math.floor(Math.random()*Math.pow(10,13));
        }
        /* Period parameters */
        this.N = 624;
        this.M = 397;
        this.MATRIX_A = 0x9908b0df;   /* constant vector a */
        this.UPPER_MASK = 0x80000000; /* most significant w-r bits */
        this.LOWER_MASK = 0x7fffffff; /* least significant r bits */

        this.mt = new Array(this.N); /* the array for the state vector */
        this.mti = this.N + 1; /* mti==N + 1 means mt[N] is not initialized */

        this.init_genrand(seed);
    };

    /* initializes mt[N] with a seed */
    MersenneTwister.prototype.init_genrand = function (s) {
        this.mt[0] = s >>> 0;
        for (this.mti = 1; this.mti < this.N; this.mti++) {
            s = this.mt[this.mti - 1] ^ (this.mt[this.mti - 1] >>> 30);
            this.mt[this.mti] = (((((s & 0xffff0000) >>> 16) * 1812433253) << 16) + (s & 0x0000ffff) * 1812433253) + this.mti;
            /* See Knuth TAOCP Vol2. 3rd Ed. P.106 for multiplier. */
            /* In the previous versions, MSBs of the seed affect   */
            /* only MSBs of the array mt[].                        */
            /* 2002/01/09 modified by Makoto Matsumoto             */
            this.mt[this.mti] >>>= 0;
            /* for >32 bit machines */
        }
    };

    /* initialize by an array with array-length */
    /* init_key is the array for initializing keys */
    /* key_length is its length */
    /* slight change for C++, 2004/2/26 */
    MersenneTwister.prototype.init_by_array = function (init_key, key_length) {
        var i = 1, j = 0, k, s;
        this.init_genrand(19650218);
        k = (this.N > key_length ? this.N : key_length);
        for (; k; k--) {
            s = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
            this.mt[i] = (this.mt[i] ^ (((((s & 0xffff0000) >>> 16) * 1664525) << 16) + ((s & 0x0000ffff) * 1664525))) + init_key[j] + j; /* non linear */
            this.mt[i] >>>= 0; /* for WORDSIZE > 32 machines */
            i++;
            j++;
            if (i >= this.N) { this.mt[0] = this.mt[this.N - 1]; i = 1; }
            if (j >= key_length) { j = 0; }
        }
        for (k = this.N - 1; k; k--) {
            s = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
            this.mt[i] = (this.mt[i] ^ (((((s & 0xffff0000) >>> 16) * 1566083941) << 16) + (s & 0x0000ffff) * 1566083941)) - i; /* non linear */
            this.mt[i] >>>= 0; /* for WORDSIZE > 32 machines */
            i++;
            if (i >= this.N) { this.mt[0] = this.mt[this.N - 1]; i = 1; }
        }

        this.mt[0] = 0x80000000; /* MSB is 1; assuring non-zero initial array */
    };

    /* generates a random number on [0,0xffffffff]-interval */
    MersenneTwister.prototype.genrand_int32 = function () {
        var y;
        var mag01 = new Array(0x0, this.MATRIX_A);
        /* mag01[x] = x * MATRIX_A  for x=0,1 */

        if (this.mti >= this.N) { /* generate N words at one time */
            var kk;

            if (this.mti === this.N + 1) {   /* if init_genrand() has not been called, */
                this.init_genrand(5489); /* a default initial seed is used */
            }
            for (kk = 0; kk < this.N - this.M; kk++) {
                y = (this.mt[kk]&this.UPPER_MASK)|(this.mt[kk + 1]&this.LOWER_MASK);
                this.mt[kk] = this.mt[kk + this.M] ^ (y >>> 1) ^ mag01[y & 0x1];
            }
            for (;kk < this.N - 1; kk++) {
                y = (this.mt[kk]&this.UPPER_MASK)|(this.mt[kk + 1]&this.LOWER_MASK);
                this.mt[kk] = this.mt[kk + (this.M - this.N)] ^ (y >>> 1) ^ mag01[y & 0x1];
            }
            y = (this.mt[this.N - 1]&this.UPPER_MASK)|(this.mt[0]&this.LOWER_MASK);
            this.mt[this.N - 1] = this.mt[this.M - 1] ^ (y >>> 1) ^ mag01[y & 0x1];

            this.mti = 0;
        }

        y = this.mt[this.mti++];

        /* Tempering */
        y ^= (y >>> 11);
        y ^= (y << 7) & 0x9d2c5680;
        y ^= (y << 15) & 0xefc60000;
        y ^= (y >>> 18);

        return y >>> 0;
    };

    /* generates a random number on [0,0x7fffffff]-interval */
    MersenneTwister.prototype.genrand_int31 = function () {
        return (this.genrand_int32() >>> 1);
    };

    /* generates a random number on [0,1]-real-interval */
    MersenneTwister.prototype.genrand_real1 = function () {
        return this.genrand_int32() * (1.0 / 4294967295.0);
        /* divided by 2^32-1 */
    };

    /* generates a random number on [0,1)-real-interval */
    MersenneTwister.prototype.random = function () {
        return this.genrand_int32() * (1.0 / 4294967296.0);
        /* divided by 2^32 */
    };

    /* generates a random number on (0,1)-real-interval */
    MersenneTwister.prototype.genrand_real3 = function () {
        return (this.genrand_int32() + 0.5) * (1.0 / 4294967296.0);
        /* divided by 2^32 */
    };

    /* generates a random number on [0,1) with 53-bit resolution*/
    MersenneTwister.prototype.genrand_res53 = function () {
        var a = this.genrand_int32()>>>5, b = this.genrand_int32()>>>6;
        return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
    };

    // BlueImp MD5 hashing algorithm from https://github.com/blueimp/JavaScript-MD5
    var BlueImpMD5 = function () {};

    BlueImpMD5.prototype.VERSION = '1.0.1';

    /*
    * Add integers, wrapping at 2^32. This uses 16-bit operations internally
    * to work around bugs in some JS interpreters.
    */
    BlueImpMD5.prototype.safe_add = function safe_add(x, y) {
        var lsw = (x & 0xFFFF) + (y & 0xFFFF),
            msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
    };

    /*
    * Bitwise rotate a 32-bit number to the left.
    */
    BlueImpMD5.prototype.bit_roll = function (num, cnt) {
        return (num << cnt) | (num >>> (32 - cnt));
    };

    /*
    * These functions implement the five basic operations the algorithm uses.
    */
    BlueImpMD5.prototype.md5_cmn = function (q, a, b, x, s, t) {
        return this.safe_add(this.bit_roll(this.safe_add(this.safe_add(a, q), this.safe_add(x, t)), s), b);
    };
    BlueImpMD5.prototype.md5_ff = function (a, b, c, d, x, s, t) {
        return this.md5_cmn((b & c) | ((~b) & d), a, b, x, s, t);
    };
    BlueImpMD5.prototype.md5_gg = function (a, b, c, d, x, s, t) {
        return this.md5_cmn((b & d) | (c & (~d)), a, b, x, s, t);
    };
    BlueImpMD5.prototype.md5_hh = function (a, b, c, d, x, s, t) {
        return this.md5_cmn(b ^ c ^ d, a, b, x, s, t);
    };
    BlueImpMD5.prototype.md5_ii = function (a, b, c, d, x, s, t) {
        return this.md5_cmn(c ^ (b | (~d)), a, b, x, s, t);
    };

    /*
    * Calculate the MD5 of an array of little-endian words, and a bit length.
    */
    BlueImpMD5.prototype.binl_md5 = function (x, len) {
        /* append padding */
        x[len >> 5] |= 0x80 << (len % 32);
        x[(((len + 64) >>> 9) << 4) + 14] = len;

        var i, olda, oldb, oldc, oldd,
            a =  1732584193,
            b = -271733879,
            c = -1732584194,
            d =  271733878;

        for (i = 0; i < x.length; i += 16) {
            olda = a;
            oldb = b;
            oldc = c;
            oldd = d;

            a = this.md5_ff(a, b, c, d, x[i],       7, -680876936);
            d = this.md5_ff(d, a, b, c, x[i +  1], 12, -389564586);
            c = this.md5_ff(c, d, a, b, x[i +  2], 17,  606105819);
            b = this.md5_ff(b, c, d, a, x[i +  3], 22, -1044525330);
            a = this.md5_ff(a, b, c, d, x[i +  4],  7, -176418897);
            d = this.md5_ff(d, a, b, c, x[i +  5], 12,  1200080426);
            c = this.md5_ff(c, d, a, b, x[i +  6], 17, -1473231341);
            b = this.md5_ff(b, c, d, a, x[i +  7], 22, -45705983);
            a = this.md5_ff(a, b, c, d, x[i +  8],  7,  1770035416);
            d = this.md5_ff(d, a, b, c, x[i +  9], 12, -1958414417);
            c = this.md5_ff(c, d, a, b, x[i + 10], 17, -42063);
            b = this.md5_ff(b, c, d, a, x[i + 11], 22, -1990404162);
            a = this.md5_ff(a, b, c, d, x[i + 12],  7,  1804603682);
            d = this.md5_ff(d, a, b, c, x[i + 13], 12, -40341101);
            c = this.md5_ff(c, d, a, b, x[i + 14], 17, -1502002290);
            b = this.md5_ff(b, c, d, a, x[i + 15], 22,  1236535329);

            a = this.md5_gg(a, b, c, d, x[i +  1],  5, -165796510);
            d = this.md5_gg(d, a, b, c, x[i +  6],  9, -1069501632);
            c = this.md5_gg(c, d, a, b, x[i + 11], 14,  643717713);
            b = this.md5_gg(b, c, d, a, x[i],      20, -373897302);
            a = this.md5_gg(a, b, c, d, x[i +  5],  5, -701558691);
            d = this.md5_gg(d, a, b, c, x[i + 10],  9,  38016083);
            c = this.md5_gg(c, d, a, b, x[i + 15], 14, -660478335);
            b = this.md5_gg(b, c, d, a, x[i +  4], 20, -405537848);
            a = this.md5_gg(a, b, c, d, x[i +  9],  5,  568446438);
            d = this.md5_gg(d, a, b, c, x[i + 14],  9, -1019803690);
            c = this.md5_gg(c, d, a, b, x[i +  3], 14, -187363961);
            b = this.md5_gg(b, c, d, a, x[i +  8], 20,  1163531501);
            a = this.md5_gg(a, b, c, d, x[i + 13],  5, -1444681467);
            d = this.md5_gg(d, a, b, c, x[i +  2],  9, -51403784);
            c = this.md5_gg(c, d, a, b, x[i +  7], 14,  1735328473);
            b = this.md5_gg(b, c, d, a, x[i + 12], 20, -1926607734);

            a = this.md5_hh(a, b, c, d, x[i +  5],  4, -378558);
            d = this.md5_hh(d, a, b, c, x[i +  8], 11, -2022574463);
            c = this.md5_hh(c, d, a, b, x[i + 11], 16,  1839030562);
            b = this.md5_hh(b, c, d, a, x[i + 14], 23, -35309556);
            a = this.md5_hh(a, b, c, d, x[i +  1],  4, -1530992060);
            d = this.md5_hh(d, a, b, c, x[i +  4], 11,  1272893353);
            c = this.md5_hh(c, d, a, b, x[i +  7], 16, -155497632);
            b = this.md5_hh(b, c, d, a, x[i + 10], 23, -1094730640);
            a = this.md5_hh(a, b, c, d, x[i + 13],  4,  681279174);
            d = this.md5_hh(d, a, b, c, x[i],      11, -358537222);
            c = this.md5_hh(c, d, a, b, x[i +  3], 16, -722521979);
            b = this.md5_hh(b, c, d, a, x[i +  6], 23,  76029189);
            a = this.md5_hh(a, b, c, d, x[i +  9],  4, -640364487);
            d = this.md5_hh(d, a, b, c, x[i + 12], 11, -421815835);
            c = this.md5_hh(c, d, a, b, x[i + 15], 16,  530742520);
            b = this.md5_hh(b, c, d, a, x[i +  2], 23, -995338651);

            a = this.md5_ii(a, b, c, d, x[i],       6, -198630844);
            d = this.md5_ii(d, a, b, c, x[i +  7], 10,  1126891415);
            c = this.md5_ii(c, d, a, b, x[i + 14], 15, -1416354905);
            b = this.md5_ii(b, c, d, a, x[i +  5], 21, -57434055);
            a = this.md5_ii(a, b, c, d, x[i + 12],  6,  1700485571);
            d = this.md5_ii(d, a, b, c, x[i +  3], 10, -1894986606);
            c = this.md5_ii(c, d, a, b, x[i + 10], 15, -1051523);
            b = this.md5_ii(b, c, d, a, x[i +  1], 21, -2054922799);
            a = this.md5_ii(a, b, c, d, x[i +  8],  6,  1873313359);
            d = this.md5_ii(d, a, b, c, x[i + 15], 10, -30611744);
            c = this.md5_ii(c, d, a, b, x[i +  6], 15, -1560198380);
            b = this.md5_ii(b, c, d, a, x[i + 13], 21,  1309151649);
            a = this.md5_ii(a, b, c, d, x[i +  4],  6, -145523070);
            d = this.md5_ii(d, a, b, c, x[i + 11], 10, -1120210379);
            c = this.md5_ii(c, d, a, b, x[i +  2], 15,  718787259);
            b = this.md5_ii(b, c, d, a, x[i +  9], 21, -343485551);

            a = this.safe_add(a, olda);
            b = this.safe_add(b, oldb);
            c = this.safe_add(c, oldc);
            d = this.safe_add(d, oldd);
        }
        return [a, b, c, d];
    };

    /*
    * Convert an array of little-endian words to a string
    */
    BlueImpMD5.prototype.binl2rstr = function (input) {
        var i,
            output = '';
        for (i = 0; i < input.length * 32; i += 8) {
            output += String.fromCharCode((input[i >> 5] >>> (i % 32)) & 0xFF);
        }
        return output;
    };

    /*
    * Convert a raw string to an array of little-endian words
    * Characters >255 have their high-byte silently ignored.
    */
    BlueImpMD5.prototype.rstr2binl = function (input) {
        var i,
            output = [];
        output[(input.length >> 2) - 1] = undefined;
        for (i = 0; i < output.length; i += 1) {
            output[i] = 0;
        }
        for (i = 0; i < input.length * 8; i += 8) {
            output[i >> 5] |= (input.charCodeAt(i / 8) & 0xFF) << (i % 32);
        }
        return output;
    };

    /*
    * Calculate the MD5 of a raw string
    */
    BlueImpMD5.prototype.rstr_md5 = function (s) {
        return this.binl2rstr(this.binl_md5(this.rstr2binl(s), s.length * 8));
    };

    /*
    * Calculate the HMAC-MD5, of a key and some data (raw strings)
    */
    BlueImpMD5.prototype.rstr_hmac_md5 = function (key, data) {
        var i,
            bkey = this.rstr2binl(key),
            ipad = [],
            opad = [],
            hash;
        ipad[15] = opad[15] = undefined;
        if (bkey.length > 16) {
            bkey = this.binl_md5(bkey, key.length * 8);
        }
        for (i = 0; i < 16; i += 1) {
            ipad[i] = bkey[i] ^ 0x36363636;
            opad[i] = bkey[i] ^ 0x5C5C5C5C;
        }
        hash = this.binl_md5(ipad.concat(this.rstr2binl(data)), 512 + data.length * 8);
        return this.binl2rstr(this.binl_md5(opad.concat(hash), 512 + 128));
    };

    /*
    * Convert a raw string to a hex string
    */
    BlueImpMD5.prototype.rstr2hex = function (input) {
        var hex_tab = '0123456789abcdef',
            output = '',
            x,
            i;
        for (i = 0; i < input.length; i += 1) {
            x = input.charCodeAt(i);
            output += hex_tab.charAt((x >>> 4) & 0x0F) +
                hex_tab.charAt(x & 0x0F);
        }
        return output;
    };

    /*
    * Encode a string as utf-8
    */
    BlueImpMD5.prototype.str2rstr_utf8 = function (input) {
        return unescape(encodeURIComponent(input));
    };

    /*
    * Take string arguments and return either raw or hex encoded strings
    */
    BlueImpMD5.prototype.raw_md5 = function (s) {
        return this.rstr_md5(this.str2rstr_utf8(s));
    };
    BlueImpMD5.prototype.hex_md5 = function (s) {
        return this.rstr2hex(this.raw_md5(s));
    };
    BlueImpMD5.prototype.raw_hmac_md5 = function (k, d) {
        return this.rstr_hmac_md5(this.str2rstr_utf8(k), this.str2rstr_utf8(d));
    };
    BlueImpMD5.prototype.hex_hmac_md5 = function (k, d) {
        return this.rstr2hex(this.raw_hmac_md5(k, d));
    };

    BlueImpMD5.prototype.md5 = function (string, key, raw) {
        if (!key) {
            if (!raw) {
                return this.hex_md5(string);
            }

            return this.raw_md5(string);
        }

        if (!raw) {
            return this.hex_hmac_md5(key, string);
        }

        return this.raw_hmac_md5(key, string);
    };

    // CommonJS module
    if (typeof exports !== 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = Chance;
        }
        exports.Chance = Chance;
    }

    // Register as an anonymous AMD module
    if (typeof define === 'function' && define.amd) {
        define([], function () {
            return Chance;
        });
    }

    // if there is a importsScrips object define chance for worker
    if (typeof importScripts !== 'undefined') {
        chance = new Chance();
    }

    // If there is a window object, that at least has a document property,
    // instantiate and define chance on the window
    if (typeof window === "object" && typeof window.document === "object") {
        window.Chance = Chance;
        window.chance = new Chance();
    }
})();
