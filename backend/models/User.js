const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      minlength: 4,
      maxlength: 20,
      match: [
        /^[!-~]+$/,
        "Username can only contain alphanumeric and special characters (no spaces)",
      ],
    },

    // ! sparse: true — Quick Notes
    // `sparse: true` is used with a MongoDB index (commonly `unique`) so that documents missing this field are ignored by the index. This allows multiple users to have no `username`, while ensuring that any username that is provided remains unique. It is useful for optional fields like username, phone number, or referral code.

    // Example:
    // ✅ Allowed
    // User1 -> username: "bikram"
    // User2 -> username: (missing)
    // User3 -> username: (missing)

    // ❌ Not Allowed
    // User4 -> username: "bikram"

    // ! match — Quick Notes
    // `match` is a Mongoose validation option that uses a Regular Expression (Regex) to check whether a field follows a specific pattern before saving it to the database. If the value doesn't match the pattern, Mongoose rejects it and returns the custom error message.

    // Example:
    // Regex:
    // /^[!-~]+$/
    // ✅ Valid
    // bikram123
    // john_doe
    // user@2026

    // ❌ Invalid
    // bik ram
    // John Doe
    // (because spaces are not allowed)
    //

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    profilePicture: {
      type: String,
      default: "",
    },
    profilePictureId: {
      type: String,
      default: "",
    },

    //!profilePicture
    // Stores the URL or file path of the user's profile image, not the image itself. Images are uploaded to external storage (e.g., Cloudinary or AWS S3), and only their URL is saved in the database. This keeps the database lightweight and improves performance.

    //! profilePictureId
    // Stores the unique identifier (e.g., Cloudinary Public ID) of the uploaded image. It is mainly used to update or delete the image from the storage service without relying on the image URL. Keeping both the URL and ID simplifies image management.

    password: {
      type: String,
      required: function () {
        // Password is required only if the user has no OAuth providers
        return !this.authProviders || this.authProviders.length === 0;
      },
    },

    //! MONGOOSE VALIDATION - REVISION NOTES (required & Conditional Validation)

    // ----------------------------------------------------------------------
    //! 1. required: true
    // ----------------------------------------------------------------------

    // required is a built-in Mongoose Validation Rule.
    //
    // It tells Mongoose:
    //
    // "This field MUST have a value before saving."
    //
    // Example:

    // title: {
    //     type: String,
    //     required: true
    // }

    // Valid Document:

    // {
    //     title: "Learn Node.js"
    // }

    // Invalid Document:

    // {
    // }
    //
    // Mongoose throws a ValidationError.

    // IMPORTANT:
    //
    // required ONLY checks whether the field exists.
    //
    // It DOES NOT check:
    //
    // - Datatype
    // - Regex
    // - Email format
    // - Length
    // - Custom validations
    //
    // Those are handled separately by:
    //
    // type
    // match
    // minlength
    // maxlength
    // validate

    // ----------------------------------------------------------------------
    //! 2. Who Enforces required?
    // ----------------------------------------------------------------------

    // required is enforced by Mongoose.
    //
    // MongoDB itself DOES NOT know anything
    // about required validation.
    //
    // Flow:
    //
    // Client
    // ↓
    // Mongoose Validation
    // ↓
    // MongoDB
    //
    // If validation fails,
    // the document NEVER reaches MongoDB.

    // ----------------------------------------------------------------------
    //! 3. Can MongoDB Store Invalid Documents?
    // ----------------------------------------------------------------------

    // YES.
    //
    // If someone bypasses Mongoose
    // and inserts directly into MongoDB:
    //
    // db.tasks.insertOne({})
    //
    // MongoDB accepts it because
    // MongoDB is schema-less by default.
    //
    // Therefore:
    //
    // required is NOT a database rule.
    // It is a Mongoose validation rule.

    // ----------------------------------------------------------------------
    //! 4. Validation Layers (Production Architecture)
    // ----------------------------------------------------------------------

    // Production applications usually validate
    // data in multiple layers.
    //
    // Frontend
    //
    // Purpose:
    // Better User Experience
    // Instant Feedback
    //
    // Backend (Mongoose)
    //
    // Purpose:
    // Security
    // Business Rules
    // Prevent Invalid Data
    //
    // Database
    //
    // Purpose:
    // Final Data Integrity
    // Database Constraints
    // Transactions
    //
    // Flow:
    //
    // Frontend
    // ↓
    // Backend Validation
    // ↓
    // Database Constraints
    // ↓
    // Database

    // This approach is called:
    //
    // Defense in Depth

    // ----------------------------------------------------------------------
    //! 5. Never Trust the Frontend
    // ----------------------------------------------------------------------

    // Frontend validation can be bypassed.
    //
    // Attackers can use:
    //
    // Postman
    // cURL
    // Custom Scripts
    // Mobile Apps
    //
    // Therefore:
    //
    // ALWAYS validate data again
    // in the backend.

    // ----------------------------------------------------------------------
    //! 6. required as a Function
    // ----------------------------------------------------------------------

    // required does NOT always have to be:
    //
    // required: true
    //
    // It can also be:
    //
    // required: function () {
    //     ...
    // }
    //
    // This is called:
    //
    // Conditional Validation

    // The function executes every time
    // Mongoose validates the document.
    //
    // Whatever the function returns:
    //
    // true
    // -> Field becomes Required
    //
    // false
    // -> Field becomes Optional

    // ----------------------------------------------------------------------
    //! 7. Real Production Example
    // ----------------------------------------------------------------------

    // password: {
    //     type: String,
    //     required: function () {
    //         return !this.authProviders ||
    //                this.authProviders.length === 0;
    //     }
    // }

    // Email Signup
    //
    // authProviders = []
    //
    // Function returns:
    //
    // true
    //
    // Password Required.

    // Google Signup
    //
    // authProviders = [
    //     { provider: "google" }
    // ]
    //
    // Function returns:
    //
    // false
    //
    // Password NOT Required.

    // ----------------------------------------------------------------------
    //! 8. Why Not required: true?
    // ----------------------------------------------------------------------

    // Suppose we write:
    //
    // password: {
    //     required: true
    // }
    //
    // Email Login
    // Works.
    //
    // Google Login
    // Fails.
    //
    // GitHub Login
    // Fails.
    //
    // Facebook Login
    // Fails.
    //
    // Because password becomes mandatory
    // for EVERY authentication method.
    //
    // Conditional Validation solves this problem.

    // ----------------------------------------------------------------------
    //! 9. Why Not Create Multiple Schemas?
    // ----------------------------------------------------------------------

    // Bad Design:
    //
    // EmailUserSchema
    //
    // GoogleUserSchema
    //
    // GithubUserSchema
    //
    // FacebookUserSchema
    //
    // Every new authentication provider
    // requires another schema.
    //
    // Better Design:
    //
    // One User Schema
    //
    // Conditional Validation
    //
    // This makes the application:
    //
    // Easier to Maintain
    // More Scalable
    // Less Duplicate Code

    // ----------------------------------------------------------------------
    //! 10. Engineering Trade-offs
    // ----------------------------------------------------------------------

    // required: true
    //
    // Advantages:
    //
    // Very Simple
    // Easy to Read
    // Slightly Faster
    //
    // Disadvantages:
    //
    // No Flexibility

    // required: function()
    //
    // Advantages:
    //
    // Dynamic
    // Supports Multiple Business Rules
    // Easily Scalable
    // One Schema Handles Multiple Cases
    //
    // Disadvantages:
    //
    // Slightly More Complex
    // Function Executes During Validation
    // Slightly More Code

    // NOTE:
    //
    // The performance overhead of calling
    // one function is extremely small
    // compared to database/network operations.

    // ----------------------------------------------------------------------
    //! 11. Interview Differences
    // ----------------------------------------------------------------------

    // required
    //
    // Mongoose Validation
    //
    // Checks:
    //
    // "Does this field exist?"

    // unique
    //
    // NOT a validator.
    //
    // Creates a Unique Index
    // in MongoDB.
    //
    // MongoDB enforces uniqueness,
    // NOT Mongoose.

    // Therefore:
    //
    // required
    // -> Validation
    //
    // unique
    // -> Database Constraint

    // ----------------------------------------------------------------------
    //! 12. Common Interview Questions
    // ----------------------------------------------------------------------

    // Q. What does required: true do?
    //
    // Makes a field mandatory.

    // --------------------------------------------------

    // Q. Does required verify datatype?
    //
    // No.
    //
    // Datatype is checked by:
    //
    // type: String

    // --------------------------------------------------

    // Q. Does MongoDB enforce required?
    //
    // No.
    //
    // Mongoose enforces it.

    // --------------------------------------------------

    // Q. Can MongoDB store a document
    // without required fields?
    //
    // Yes.
    //
    // If data is inserted directly
    // into MongoDB.

    // --------------------------------------------------

    // Q. Why use required as a function?
    //
    // To support conditional validation.
    //
    // Example:
    //
    // Password required only
    // for Email Login.

    // --------------------------------------------------

    // Q. When does Mongoose execute
    // the required function?
    //
    // Every time the document
    // is validated before saving.

    // --------------------------------------------------

    // Q. What should the function return?
    //
    // true
    // or
    // false

    // --------------------------------------------------

    // Q. What if it returns "hello"?
    //
    // JavaScript converts it
    // to a Truthy value.
    //
    // Therefore:
    //
    // "hello"
    //
    // behaves like:
    //
    // true

    // because non-empty strings
    // are Truthy.

    // ----------------------------------------------------------------------
    //! 13. Golden Interview Points
    // ----------------------------------------------------------------------

    // ✓ required is a Mongoose Validation.
    //
    // ✓ MongoDB does NOT enforce required.
    //
    // ✓ Validation happens BEFORE saving.
    //
    // ✓ Never trust frontend validation.
    //
    // ✓ Validate again in the backend.
    //
    // ✓ required can be:
    //
    // true
    // false
    // function()
    //
    // ✓ Conditional Validation makes
    // one schema support multiple
    // authentication providers.
    //
    // ✓ One flexible schema is better
    // than creating multiple schemas.
    //
    // ✓ required checks ONLY field existence.
    //
    // ✓ unique is NOT validation.
    // It is a MongoDB Unique Index.
    //
    // ✓ Backend Validation + Database Constraints
    // provide the safest production architecture.

    authProviders: [
      {
        provider: String,
        uid: String,
      },
    ],
    // Array to track OAuth providers (e.g., google, github, facebook)

    //! TOPIC: password (Conditional Validation
    // Importance: ⭐⭐⭐⭐⭐
    // Difficulty: ⭐⭐⭐☆☆
    // Interview Frequency: Very High

    // WHY THIS CODE EXISTS

    // This field stores the user's hashed password. However, not every user
    // signs up using an email and password. Some users authenticate using
    // OAuth providers like Google or GitHub. Therefore, the password should
    // only be required for users who do not have any OAuth provider linked.

    // CODE EXPLANATION

    //password: {
    //type: String,

    // The password is stored as a String because hashing algorithms
    // like bcrypt return a hashed string instead of plain text.

    // Instead of using `required: true`, a function is used.
    // Mongoose executes this function before validation and expects
    // a boolean value. If the function returns true, password becomes
    // mandatory; otherwise it is optional.

    //required: function () {

    // `this` refers to the current User document being validated.
    // A normal function is used because Mongoose binds `this` to
    // the document. Arrow functions do not have their own `this`
    // and therefore should not be used here.

    // If authProviders does not exist OR its length is 0,
    // the user has not signed up using OAuth, so a password
    // is required.

    // return !this.authProviders || this.authProviders.length === 0;
    //},
    //}
    //! IMPORTANT CONCEPTS

    // Conditional Validation
    // Mongoose allows validators like `required` to be functions.
    // This makes validation dynamic instead of always true or false.

    // `this` Keyword
    // Inside a normal Mongoose validator function, `this` refers
    // to the current document being validated.

    // Why not an Arrow Function?
    // Arrow functions inherit `this` from the outer scope instead
    // of creating their own. Therefore, `this.authProviders` would
    // not refer to the current document and the validation would fail.

    // Why store passwords as String?
    // Passwords are never stored in plain text.
    // They are hashed using algorithms like bcrypt or Argon2,
    // and the resulting hash is stored as a string.

    // Industry Best Practice
    // Never store plain passwords.
    // Always hash passwords before saving them.
    // Use conditional validation when supporting both traditional
    // authentication and OAuth authentication.

    // QUICK REVISION

    // `required` can be a function instead of a boolean.
    // The function must return true or false.
    // `this` refers to the current Mongoose document.
    // Use a normal function, not an arrow function.
    // Password is required only when no OAuth provider exists.

    // THINGS TO REMEMBER

    // `required: true` -> Always required.
    // `required: function(){}` -> Conditionally required.
    // `this` works correctly only with normal functions.
    // Passwords should always be hashed before saving.
    //! INTERVIEW QUESTIONS

    // Q1. Why is `required` a function instead of `true`?
    // Because password validation depends on the authentication method.
    // Email/password users need a password, while OAuth users do not.

    // Q2. Why is a normal function used instead of an arrow function?
    // Because Mongoose binds `this` to the current document only
    // for normal functions. Arrow functions do not have their own `this`.

    // Q3. What does `this` refer to here?
    // The current User document being validated.

    // Q4. Is the password stored in plain text?
    // No. It is hashed using bcrypt or another hashing algorithm.

    // Q5. What happens if this function returns false?
    // Mongoose does not require the password field.

    // COMMON MISTAKES

    // Using an arrow function and expecting `this` to work.
    // Storing plain text passwords.
    // Using `required: true` even when OAuth authentication exists.

    //! TOPIC: authProviders (OAuth Providers)

    // Importance: ⭐⭐⭐⭐⭐
    // Difficulty: ⭐⭐☆☆☆
    // Interview Frequency: High

    // WHY THIS CODE EXISTS

    // A user can sign in using multiple authentication providers
    // such as Google, GitHub or Facebook. This field stores all
    // linked OAuth providers so that one account can support
    // multiple login methods.

    //authProviders: [
    //{
    //provider: String,
    //uid: String
    //}
    //]

    //! IMPORTANT CONCEPTS

    // Why an Array?
    // A user may link multiple OAuth accounts.
    // Example:
    // [
    //   { provider: "google", uid: "12345" },
    //   { provider: "github", uid: "98765" }
    // ]

    // provider
    // Stores the OAuth provider name.
    // Examples: google, github, facebook, apple.

    // uid
    // Stores the unique user identifier returned by the provider.
    // This identifier is stable and is used to recognize the user
    // during future logins.

    // Why store uid instead of only email?
    // Users can change their email address.
    // The provider's unique ID generally remains constant,
    // making it a reliable identifier.

    // Industry Best Practice
    // Restrict provider values using an enum.
    // Store provider-specific information separately if the
    // authentication system becomes more complex.

    // QUICK REVISION

    // authProviders is an array of OAuth accounts.
    // provider identifies the login service.
    // uid uniquely identifies the user within that service.
    // One user can connect multiple providers.

    // THINGS TO REMEMBER

    // One account can have multiple OAuth providers.
    // uid is more reliable than email.
    // Arrays allow future expansion without schema changes.

    //! INTERVIEW QUESTIONS

    // Q1. Why is authProviders an array?
    // Because one user can connect multiple OAuth providers.

    // Q2. What does provider store?
    // The OAuth service name (Google, GitHub, Facebook, etc.).

    // Q3. What does uid store?
    // The unique identifier provided by the OAuth service.

    // Q4. Why not identify users only by email?
    // Emails can change, while provider IDs are usually permanent.

    // Q5. How could this schema be improved?
    // Use an enum for provider values or define a dedicated
    // sub-schema for OAuth accounts.

    // COMMON MISTAKES

    // Assuming one user can only have one OAuth provider.
    // Using email instead of the provider's unique ID.
    // Not validating provider values.

    // Privacy toggle: when false, other group members cannot see this user's achievements

    achievementsPublic: {
      type: Boolean,
      default: true,
    },

    //! JAVASCRIPT "this" - REVISION NOTES

    // ----------------------------------------------------------------------
    //! 1. What is "this" ?
    // ----------------------------------------------------------------------

    // "this" is a special JavaScript keyword.
    //
    // It refers to the object that CALLS the current function.
    //
    // IMPORTANT:
    //
    // "this" DOES NOT depend on where
    // the function is written.
    //
    // "this" depends on HOW the function
    // is called.
    //
    // Interview Definition:
    //
    // "this" is a special JavaScript keyword whose value
    // is determined by HOW a function is called,
    // not where it is written.

    // ----------------------------------------------------------------------
    //! 2. The Dot Rule (Most Important Rule)
    // ----------------------------------------------------------------------

    // For normal functions:
    //
    // The object BEFORE the dot (.)
    // becomes "this".

    // Example:

    // user.greet();
    //
    // this = user

    // Example:

    // car.show();
    //
    // this = car

    // This rule works for normal object methods.

    // ----------------------------------------------------------------------
    //! 3. Function Reference vs Function Call
    // ----------------------------------------------------------------------

    // These are NOT the same.

    // Function Reference

    // person1.greet

    // No parentheses.
    //
    // The function is NOT executed.
    //
    // JavaScript simply returns
    // the function stored inside
    // the greet property.

    // Function Call

    // person1.greet()

    // Parentheses exist.
    //
    // The function EXECUTES.

    // ----------------------------------------------------------------------
    //! 4. Functions are also Property Values
    // ----------------------------------------------------------------------

    // Just like this:

    // const user = {
    //     name: "Bikram"
    // };

    // "name" stores a String.

    // Similarly:

    // const user = {
    //     greet: function () {}
    // };

    // "greet" stores a Function.

    // Therefore,
    // functions are simply values
    // stored inside object properties.

    // ----------------------------------------------------------------------
    //! 5. Copying a Function Property
    // ----------------------------------------------------------------------

    // Example:

    // person2.greet = person1.greet;

    // Right Side:
    //
    // person1.greet
    //
    // Returns the function.
    //
    // It DOES NOT execute it.

    // Left Side:
    //
    // person2.greet
    //
    // Creates a new property named "greet"
    // inside person2.
    //
    // That property stores the SAME function.

    // Result:

    // person1
    // ───────
    // greet ---> Function
    //
    // person2
    // ───────
    // greet ---> Same Function

    // The function is shared.
    // It is NOT duplicated.

    // ----------------------------------------------------------------------
    //! 6. Property Name Can Be Anything
    // ----------------------------------------------------------------------

    // Example:

    // person2.hello = person1.greet;

    // JavaScript creates a new property
    // named "hello".

    // The value stored inside "hello"
    // is the SAME function.

    // Then:

    // person2.hello();

    // works perfectly.

    // Function names are NOT important.
    //
    // The property used to call
    // the function determines "this".

    // ----------------------------------------------------------------------
    //! 7. How "this" is Determined
    // ----------------------------------------------------------------------

    // Example:

    // person2.greet();

    // JavaScript looks before the dot.

    // person2
    //
    // Therefore:

    // this = person2

    // Inside the function:

    // console.log(this.name);

    // becomes

    // console.log(person2.name);

    // ----------------------------------------------------------------------
    //! 8. Functions Do NOT Own "this"
    // ----------------------------------------------------------------------

    // Very Important:
    //
    // A function does NOT permanently
    // belong to an object.
    //
    // It receives "this"
    // ONLY when someone calls it.

    // Wrong Thinking:
    //
    // "This function belongs to person1."

    // Correct Thinking:
    //
    // The same function can be called
    // by many different objects.
    //
    // Whoever calls it
    // becomes "this".

    // ----------------------------------------------------------------------
    //! 9. One Function - Multiple Objects
    // ----------------------------------------------------------------------

    // Example:

    // const greetFunction = function () {
    //     console.log(this.name);
    // };

    // person1.greet = greetFunction;

    // person2.greet = greetFunction;

    // person1.greet();
    //
    // Output:
    //
    // Bikram

    // person2.greet();
    //
    // Output:
    //
    // Rahul

    // Same Function.
    //
    // Different "this".

    // ----------------------------------------------------------------------
    //! 10. Function Reference vs this
    // ----------------------------------------------------------------------

    // Example:

    // const fn = person1.greet;

    // This only copies the function reference.

    // No execution happens.

    // Later:

    // fn();

    // There is NO object before the dot.

    // Therefore,
    // "this" is NOT person1.

    // IMPORTANT:
    //
    // "this" is decided when the function
    // is CALLED,
    // not when it is COPIED.

    // ----------------------------------------------------------------------
    //! 11. Engineering Thinking
    // ----------------------------------------------------------------------

    // Why does Mongoose use:
    //
    // required: function(){}
    //
    // instead of:
    //
    // required: function(doc){}
    //
    // Reasons:
    //
    // ✓ Matches JavaScript conventions.
    //
    // ✓ Cleaner API.
    //
    // ✓ Better readability.
    //
    // ✓ Similar to built-in JavaScript methods.
    //
    // ✓ Easier for developers to understand.

    // ----------------------------------------------------------------------
    //! 12. Interview Questions
    // ----------------------------------------------------------------------

    // Q. What is "this"?
    //
    // A special JavaScript keyword whose value
    // depends on HOW a function is called.

    // --------------------------------------------------

    // Q. Does "this" depend on where
    // the function is written?
    //
    // No.

    // --------------------------------------------------

    // Q. What determines "this"?
    //
    // The object that calls the function.

    // --------------------------------------------------

    // Q. Does person.greet execute the function?
    //
    // No.
    //
    // It returns the function.

    // --------------------------------------------------

    // Q. Does person.greet() execute the function?
    //
    // Yes.
    //
    // Parentheses execute the function.

    // --------------------------------------------------

    // Q. Can one function be shared
    // by multiple objects?
    //
    // Yes.
    //
    // The same function can be stored
    // inside many objects.

    // --------------------------------------------------

    // Q. Does a function permanently own "this"?
    //
    // No.
    //
    // "this" is assigned
    // when the function is called.

    // ----------------------------------------------------------------------
    //! 13. Golden Interview Points
    // ----------------------------------------------------------------------

    // ✓ "this" depends on HOW a function is called.
    //
    // ✓ The object before the dot
    // becomes "this".
    //
    // ✓ Functions are values.
    //
    // ✓ Functions can be stored
    // inside object properties.
    //
    // ✓ person.greet
    // returns the function.
    //
    // ✓ person.greet()
    // executes the function.
    //
    // ✓ One function can be shared
    // by many objects.
    //
    // ✓ Functions do NOT own "this".
    //
    // ✓ The caller provides "this"
    // at runtime.
    //
    // ✓ This concept is heavily used
    // in Mongoose,
    // Express,
    // Classes,
    // Instance Methods,
    // Middleware,
    // Validators,
    // and Object-Oriented JavaScript.


    //! COMMON MISTAKES & INTERVIEW TRAPS

// ----------------------------------------------------------------------
//! Common Mistake 1
// ----------------------------------------------------------------------

// ❌ Wrong:
//
// "this" refers to the object
// where the function is written.

// ✔ Correct:
//
// "this" depends on HOW
// the function is called.


// ----------------------------------------------------------------------
//! Common Mistake 2
// ----------------------------------------------------------------------

// ❌ Wrong:
//
// person.greet
// executes the function.

// ✔ Correct:
//
// person.greet
//
// ONLY returns the function.
//
// It does NOT execute it.
//
// Parentheses are required
// to execute the function.


// ----------------------------------------------------------------------
//! Common Mistake 3
// ----------------------------------------------------------------------

// ❌ Wrong:
//
// Functions permanently belong
// to an object.

// ✔ Correct:
//
// Functions are independent values.
//
// The same function can be stored
// inside multiple objects.


// ----------------------------------------------------------------------
//! Common Mistake 4
// ----------------------------------------------------------------------

// ❌ Wrong:
//
// Copying a function creates
// a new function.

// Example:

// person2.greet = person1.greet;

// ✔ Correct:
//
// JavaScript copies the FUNCTION REFERENCE.
//
// Both properties point to
// the SAME function.


// ----------------------------------------------------------------------
//! Common Mistake 5
// ----------------------------------------------------------------------

// ❌ Wrong:
//
// "this" is decided
// when the function is created.

// ✔ Correct:
//
// "this" is decided
// EVERY TIME the function
// is called.


// ----------------------------------------------------------------------
//! Common Mistake 6
// ----------------------------------------------------------------------

// ❌ Wrong:
//
// The function name determines "this".

// ✔ Correct:
//
// The OBJECT BEFORE THE DOT
// determines "this".

// Example:

// person1.greet();

// this = person1

// person2.greet();

// this = person2

// person2.hello();

// this = person2

// Property name does NOT matter.


// ----------------------------------------------------------------------
//! Common Mistake 7
// ----------------------------------------------------------------------

// ❌ Wrong:
//
// person2.greet = person1.greet;
//
// calls the function.

// ✔ Correct:
//
// It simply copies the function
// reference.
//
// No execution happens.


// ----------------------------------------------------------------------
//! Common Mistake 8
// ----------------------------------------------------------------------

// ❌ Wrong:
//
// "this" always refers to
// the current object.

// ✔ Correct:
//
// There is NO "current object"
// in JavaScript.
//
// "this" depends entirely on
// how the function is invoked.


// ----------------------------------------------------------------------
//! Interview Traps
// ----------------------------------------------------------------------

// ⭐ Trap:
//
// const fn = person.greet;
//
// Does this execute greet()?
//
// ✔ No.
// It only stores the function reference.

// --------------------------------------------------

// ⭐ Trap:
//
// Can the same function
// belong to multiple objects?
//
// ✔ Yes.
// Functions are values and
// can be shared.

// --------------------------------------------------

// ⭐ Trap:
//
// What determines "this"?
//
// ✔ The object that calls
// the function.

// --------------------------------------------------

// ⭐ Trap:
//
// Is "this" stored inside
// the function permanently?
//
// ✔ No.
// It is assigned dynamically
// at call time.


// ----------------------------------------------------------------------
//! One-Line Revision
// ----------------------------------------------------------------------

// Remember these three rules:
//
// 1. Functions are Values.
//
// 2. The object before the dot
// becomes "this".
//
// 3. "this" is assigned when
// the function is CALLED,
// not when it is CREATED.

    isPublicProfile: {
      type: Boolean,
      default: true,
    },
    showOnLeaderboard: {
      type: Boolean,
      default: true,
    },
    theme: {
      type: String,
      enum: ["light", "dark", "premium-aurora", "minimalistic", "claymorphism"],
      default: "light",
    },
    currentStreak: {
      type: Number,
      default: 0,
    },
    highestStreak: {
      type: Number,
      default: 0,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
    emailNotifications: {
      type: Boolean,
      default: true,
    },
    subscriptionTier: {
      type: String,
      enum: ["free", "premium", "refund_pending"],
      default: "free",
    },

    subscriptionExpiresAt: {
      type: Date,
      default: null,
    },
    subscriptionId: {
      type: String,
      default: null,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
    },
    pendingSubscriptionId: {
      type: String,
      default: null,
    },
    pendingSubscriptionDuration: {
      type: String,
      default: null,
    },
    // LeetCode Integration
    leetcodeUsername: {
      type: String,
      default: null,
      sparse: true,
    },
    // Holds the unverified username until verification succeeds
    leetcodePendingUsername: {
      type: String,
      default: null,
    },
    leetcodeVerificationCode: {
      type: String,
      default: null,
    },
    leetcodeVerificationExpiry: {
      type: Date,
      default: null,
    },
    leetcodeUsernameChangeCount: {
      type: Number,
      default: 0,
    },
    leetcodeLastVerifiedAt: {
      type: Date,
      default: null,
    },
    leetcodeProfilePicture: {
      type: String,
      default: "",
    },
    // 'none' = no pending retry; 'pending_retry' = first verify failed, retry window open
    leetcodeVerificationStatus: {
      type: String,
      enum: ["none", "pending_retry"],
      default: "none",
    },
    // Timestamp when the retry was scheduled — drives both the 5-min enable and 15-min expiry timers
    leetcodeRetryScheduledAt: {
      type: Date,
      default: null,
    },
    leetcodeAutoSync: {
      type: Boolean,
      default: false,
    },
    // Developer Hub Integrations
    githubOAuth: {
      accessToken: { type: String, default: null },
      refreshToken: { type: String, default: null },
      expiry: { type: Date, default: null }
    },
    googleCalendarOAuth: {
      accessToken: { type: String, default: null },
      refreshToken: { type: String, default: null },
      expiry: { type: Date, default: null }
    },
    wakaTimeKey: {
      type: String,
      default: null
    },
    stackOverflowId: {
      type: String,
      default: null
    },
    devtoUsername: {
      type: String,
      default: null
    },
    mediumUsername: {
      type: String,
      default: null
    },
    // OTP fields for Forgot Password
    resetOtp: {
      type: String,
      default: null,
    },
    resetOtpExpire: {
      type: Date,
      default: null,
    },
    resetOtpAttempts: {
      type: Number,
      default: 0,
    },
    // Blacklist management
    isBlacklisted: {
      type: Boolean,
      default: false,
    },
    blacklistedUntil: {
      type: Date,
      default: null,
    },
    blacklistReason: {
      type: String,
      default: "",
    },
    claimedBadges: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Badge",
      },
    ],

    //! TOPIC: claimedBadges (ObjectId Reference)
    // Importance: ⭐⭐⭐⭐⭐
    // Difficulty: ⭐⭐⭐☆☆
    // Interview Frequency: Very High

    // WHY THIS CODE EXISTS

    // This field stores all the badges that a user has claimed.
    // Instead of storing the complete Badge objects inside the User document,
    // MongoDB stores only the unique IDs (ObjectIds) of those Badge documents.
    // This creates a relationship between the User and Badge collections and
    // avoids duplicating badge data.

    // CODE EXPLANATION

    // claimedBadges: [{
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: 'Badge',
    // }]

    // claimedBadges
    // This is the field name. It stores all badges earned by a user.

    // [
    // ]
    // The square brackets indicate that this field is an Array.
    // A user can earn multiple badges, so multiple ObjectIds can be stored.

    // type
    // Defines the datatype of each element inside the array.

    // mongoose.Schema.Types.ObjectId
    // ObjectId is MongoDB's default unique identifier for every document.
    // Instead of storing the entire Badge document, only its ObjectId is stored.

    // Example:
    //
    // User Document
    // {
    //     name: "Bikram",
    //     claimedBadges: [
    //         ObjectId("64ad8f..."),
    //         ObjectId("64be92...")
    //     ]
    // }
    //
    // Badge Collection
    // {
    //     _id: ObjectId("64ad8f..."),
    //     title: "100 Day Streak"
    // }
    //
    // {
    //     _id: ObjectId("64be92..."),
    //     title: "Early Bird"
    // }

    // ref: 'Badge'
    // `ref` tells Mongoose which collection/model this ObjectId belongs to.
    // It establishes a reference to the Badge model.
    // This allows Mongoose to automatically fetch Badge details later
    // using the `.populate()` method.

    // Example:
    //
    // const user = await User.findById(id).populate("claimedBadges");
    //
    // Instead of getting:
    //
    // claimedBadges: [
    //     ObjectId("64ad8f...")
    // ]
    //
    // You get:
    //
    // claimedBadges: [
    //     {
    //         _id: "...",
    //         title: "100 Day Streak",
    //         description: "..."
    //     }
    // ]

    //! IMPORTANT CONCEPTS

    // What is ObjectId?
    // Every MongoDB document automatically receives a unique identifier called
    // ObjectId. It is used to uniquely identify documents across collections.
    // It is similar to a Primary Key in SQL databases.

    // What is a Reference?
    // A reference means storing the ID of another document instead of storing
    // the complete document itself. This creates relationships between collections.

    // Why not store the entire Badge object?
    // If badge information changes (for example, its title or icon),
    // updating every user's document would be inefficient.
    // By storing only the ObjectId, the Badge document is maintained in one place,
    // and every user automatically sees the updated information when populated.

    // What does `ref` do?
    // `ref` tells Mongoose which model the ObjectId belongs to.
    // Without `ref`, Mongoose wouldn't know which collection to query during populate.

    // What is Populate?
    // Populate is a Mongoose feature that replaces stored ObjectIds with the
    // actual referenced documents. It works similarly to a JOIN operation in SQL,
    // although MongoDB itself does not perform joins in the same way.

    // INDUSTRY BEST PRACTICES

    // Use ObjectId references when the related data can be reused or shared.
    // Avoid embedding large or frequently changing documents.
    // Populate only the fields you actually need to improve performance.
    // Example:
    // .populate("claimedBadges", "title icon")

    // QUICK REVISION

    // claimedBadges stores references to Badge documents.
    // ObjectId uniquely identifies each Badge.
    // ref connects the ObjectId to the Badge model.
    // populate() replaces ObjectIds with complete Badge documents.
    // This design reduces duplication and keeps data consistent.

    // THINGS TO REMEMBER

    // ObjectId is MongoDB's unique document identifier.
    // ref alone does not fetch data.
    // populate() is required to retrieve the referenced documents.
    // ObjectId relationships are one of the most common interview topics.

    //! INTERVIEW QUESTIONS

    // Q1. Why use ObjectId instead of storing the entire Badge object?
    // Because it avoids data duplication, keeps the database normalized,
    // and allows badge information to be updated in one place.

    // Q2. What is ObjectId?
    // It is MongoDB's default unique identifier assigned to every document.
    // It is similar to a Primary Key in relational databases.

    // Q3. What does `ref` do?
    // It tells Mongoose which model the ObjectId belongs to,
    // enabling populate() to retrieve the referenced document.

    // Q4. Does `ref` automatically fetch Badge details?
    // No.
    // It only defines the relationship.
    // You must call `.populate()` to retrieve the actual Badge documents.

    // Q5. What is populate()?
    // A Mongoose method that replaces ObjectIds with their corresponding
    // documents from the referenced collection.

    // Q6. When should you use references instead of embedding?
    // Use references when the related data is large, shared by many documents,
    // or changes frequently. Use embedding for small, tightly coupled data
    // that is always accessed together.

    // COMMON MISTAKES

    // Storing the complete Badge object inside every User document.
    // Thinking `ref` automatically loads related documents.
    // Forgetting to use `.populate()` when Badge details are needed.
    // Using ObjectId references for tiny data that could be embedded efficiently.

    // Account Lockout fields

    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    // Persistent Media Upload Rate Limiting
    imageUploadCount: { type: Number, default: 0 },
    audioUploadCount: { type: Number, default: 0 }, // For recordings
    audioFileUploadCount: { type: Number, default: 0 }, // For manual uploads
    mediaResetTime: { type: Date, default: Date.now },

    //! IMPORTANT: Date.now
    // Notice that Date.now is written WITHOUT parentheses.

    // Correct:
    // default: Date.now

    // Incorrect:
    // default: Date.now()

    // Date.now is a function reference.
    // Mongoose calls this function whenever a new document is created,
    // ensuring every user gets the current time at creation.

    // If Date.now() were used, it would execute only once when the schema
    // loads, causing every future document to receive the same timestamp.

    // Firebase Cloud Messaging (Push Notifications)
    fcmTokens: [
      {
        type: String,
        trim: true,
      },
    ],
    mutedGroups: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Group",
      },
    ],
    lastViewedChangelogAt: {
      type: Date,
      default: null,
    },
    // AI Productivity Insights Bio (Public/Shared)
    productivityBio: {
      type: String,
      default: "",
    },
    // AI Daily Generation tracking
    aiGenerationCount: {
      type: Number,
      default: 0,
    },
    aiGenerationResetTime: {
      type: Date,
      default: Date.now,
    },
    // Weekly AI Summary tracking
    weeklySummaryDailyCount: {
      type: Number,
      default: 0,
    },
    weeklySummaryResetTime: {
      type: Date,
      default: Date.now,
    },
    // Monthly AI Summary tracking
    monthlySummaryDailyCount: {
      type: Number,
      default: 0,
    },
    monthlySummaryResetTime: {
      type: Date,
      default: Date.now,
    },
    monthlySummaryMonthlyCount: {
      type: Number,
      default: 0,
    },
    monthlySummaryMonthlyResetTime: {
      type: Date,
      default: Date.now,
    },
    // AI Daily Task Extraction (Photo Upload) tracking
    aiPhotoExtractionCount: {
      type: Number,
      default: 0,
    },
    aiPhotoExtractionResetTime: {
      type: Date,
      default: Date.now,
    },
    voiceParseCount: {
      type: Number,
      default: 0,
    },
    voiceParseResetTime: {
      type: Date,
      default: Date.now,
    },
    // Canvas AI Chat daily message tracking
    canvasMsgCount: {
      type: Number,
      default: 0,
    },
    canvasMsgResetTime: {
      type: Date,
      default: Date.now,
    },
    // Daily Group Creations limits tracking
    dailyGroupCreationsCount: {
      type: Number,
      default: 0,
    },
    dailyGroupCreationsResetTime: {
      type: Date,
      default: Date.now,
    },
    graceCount: {
      type: Number,
      default: 0,
    },
    graceResetTime: {
      type: Date,
      default: Date.now,
    },
    // Refunds & Abuse tracking
    refundStatus: {
      type: String,
      enum: ["none", "requested", "approved", "rejected"],
      default: "none",
    },
    refundRequestedAt: {
      type: Date,
      default: null,
    },
    refundReason: {
      type: String,
      default: "",
    },
    premiumActivatedAt: {
      type: Date,
      default: null,
    },
    premiumUsageLogs: [
      {
        actionType: {
          type: String,
          enum: ["voice_parse", "grace_apply", "photo_extract"],
        },
        timestamp: { type: Date, default: Date.now },
        details: String,
        razorpayPaymentId: String,
      },
    ],
    paymentHistory: [
      {
        orderId: String,
        paymentId: String,
        amount: Number,
        duration: String,
        purchasedAt: { type: Date, default: Date.now },
        refundStatus: {
          type: String,
          enum: ["none", "requested", "approved", "rejected"],
          default: "none",
        },
        refundReason: {
          type: String,
          default: "",
        },
      },
    ],
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    pointsBalance: {
      type: Number,
      default: 0,
    },
    referralPromptDismissed: {
      type: Boolean,
      default: false,
    },
    hasClaimedFreePremium: {
      type: Boolean,
      default: false,
    },
    lastCompletedDate: {
      type: String,
      default: null,
    },
    globalStreakReminderEnabled: {
      type: Boolean,
      default: true,
    },
    globalStreakReminderTime: {
      type: String,
      default: "21:00",
    },
    globalStreakReminderType: {
      type: String,
      enum: ["notification", "alarm"],
      default: "notification",
    },
    friends: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    friendRequests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    sentRequests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationOtp: {
      type: String,
      default: null,
    },
    emailVerificationOtpExpiresAt: {
      type: Date,
      default: null,
    },
    emailVerificationOtpSentAt: {
      type: Date,
      default: null,
    },
    bookmarks: [
      {
        title: { type: String, required: true },
        url: { type: String, required: true },
        serviceType: { type: String, default: 'Custom' },
        description: { type: String, default: '', maxlength: 200 },
        tags: [{ type: String }],
        createdAt: { type: Date, default: Date.now }
      }
    ],
    aiNotesCount: {
      type: Number,
      default: 0
    },
    customYouTubeApiKey: {
      type: String,
      default: ''
    },
    customGeminiApiKey: {
      type: String,
      default: ''
    },
  },
  { timestamps: true },
);

// Optimize leaderboard queries with compound indexes
UserSchema.index({ showOnLeaderboard: 1, isBlacklisted: 1, currentStreak: -1 });
UserSchema.index({ showOnLeaderboard: 1, isBlacklisted: 1, highestStreak: -1 });
module.exports = mongoose.model("User", UserSchema);

//! TOPIC: Compound Indexes (Leaderboard Optimization)

// Importance: ⭐⭐⭐⭐⭐
// Difficulty: ⭐⭐⭐⭐☆
// Interview Frequency: Very High

// WHY THIS CODE EXISTS

// These indexes are created to make leaderboard queries much faster.
// Without indexes, MongoDB would scan every User document whenever
// someone opens the leaderboard. As the number of users grows,
// this becomes slow and inefficient.
//
// A compound index combines multiple fields into a single index.
// This allows MongoDB to filter and sort data efficiently using one index
// instead of scanning the entire collection.

// CODE EXPLANATION

// UserSchema.index({
//     showOnLeaderboard: 1,
//     isBlacklisted: 1,
//     currentStreak: -1
// });

// UserSchema.index()
// Creates an index on the User collection.
// An index is a special data structure that helps MongoDB locate
// documents much faster, similar to an index at the back of a book.

// showOnLeaderboard: 1
// The first field in the index.
// Only users who allow themselves to appear on the leaderboard
// are considered.
//
// 1 means Ascending Index.
// MongoDB stores values from smallest to largest.

// isBlacklisted: 1
// The second field in the compound index.
// Blacklisted users can be filtered out quickly without scanning
// the entire collection.

// currentStreak: -1
// The third field in the index.
// -1 means Descending Index.
// Since leaderboards usually display the highest streak first,
// descending order avoids additional sorting work.

// This index is mainly useful for queries like:
//
// User.find({
//     showOnLeaderboard: true,
//     isBlacklisted: false
// }).sort({
//     currentStreak: -1
// });

// MongoDB can use this single index to:
// 1. Filter users.
// 2. Remove blacklisted users.
// 3. Return results already sorted.
//
// No extra sorting step is required.

// -------------------------------------------------------------

// UserSchema.index({
//     showOnLeaderboard: 1,
//     isBlacklisted: 1,
//     highestStreak: -1
// });

// This is another compound index.
// It works exactly like the previous one,
// except it optimizes sorting based on highestStreak
// instead of currentStreak.

// It supports queries like:
//
// User.find({
//     showOnLeaderboard: true,
//     isBlacklisted: false
// }).sort({
//     highestStreak: -1
// });

// Because currentStreak and highestStreak are different fields,
// MongoDB needs two different indexes.
// One index cannot efficiently optimize both sorting operations.
//! IMPORTANT CONCEPTS

// What is an Index?
// An index is a special data structure that stores selected field values
// in an organized way, allowing MongoDB to locate documents quickly
// without scanning the entire collection.

// Real Life Example
// Imagine a book with 1000 pages.
//
// Without an index:
// You search every page until you find the topic.
//
// With an index:
// You open the index page,
// find the page number,
// and directly jump there.
//
// MongoDB indexes work similarly.

// What is a Compound Index?
// A compound index contains multiple fields.
// Instead of indexing only one field,
// MongoDB indexes a combination of fields.
//
// Example:
//
// {
//     showOnLeaderboard,
//     isBlacklisted,
//     currentStreak
// }

// What do 1 and -1 mean?
//
// 1  -> Ascending Order
//      Smallest → Largest
//
// -1 -> Descending Order
//      Largest → Smallest
//
// Since leaderboards usually show the highest score first,
// descending indexes are commonly used for ranking fields.

// Why create two indexes?
// currentStreak and highestStreak are different sorting fields.
// MongoDB cannot efficiently reuse one compound index
// for both types of sorting,
// so separate indexes are created.

// Do indexes make everything faster?
// No.
// Reads become much faster,
// but writes (insert, update, delete) become slightly slower
// because MongoDB must also update every affected index.

// INDUSTRY BEST PRACTICES

// Create indexes only for frequently executed queries.
// Avoid creating unnecessary indexes because they consume storage
// and slow down write operations.
// Design compound indexes to match the application's filter
// and sort pattern.
// Use explain() to verify whether MongoDB is actually using an index.

// QUICK REVISION

// An index speeds up database queries.
// A compound index stores multiple fields together.
// 1 means ascending order.
// -1 means descending order.
// Leaderboards commonly use descending indexes.
// More indexes improve reads but slightly slow writes.

// THINGS TO REMEMBER

// Indexes improve READ performance.
// Indexes increase WRITE cost.
// Compound indexes should match real query patterns.
// MongoDB can often use an index for both filtering and sorting.
// One compound index cannot efficiently optimize every possible query.
//! INTERVIEW QUESTIONS

// Q1. What is an index in MongoDB?
// An index is a data structure that helps MongoDB locate documents
// quickly without scanning the entire collection.

// Q2. What is a compound index?
// A compound index is an index built on multiple fields.
// It improves queries that filter or sort using those fields together.

// Q3. Why is currentStreak indexed with -1?
// Because leaderboards usually display users with the highest streak first,
// making descending order the natural choice.

// Q4. What do 1 and -1 represent in an index?
// 1 represents ascending order.
// -1 represents descending order.

// Q5. Why create two separate indexes instead of one?
// Because one query sorts by currentStreak
// while another sorts by highestStreak.
// MongoDB requires different indexes to optimize each sort efficiently.

// Q6. Do indexes improve insert and update performance?
// No.
// They improve read performance,
// but inserts, updates and deletes become slightly slower
// because MongoDB must maintain the indexes.

// Q7. What happens if no index exists?
// MongoDB performs a Collection Scan (COLLSCAN),
// meaning it checks every document one by one,
// which becomes slow for large collections.

// COMMON MISTAKES

// Creating indexes on every field without understanding query patterns.
// Assuming indexes always improve performance.
// Forgetting that indexes consume additional storage.
// Creating a compound index whose field order doesn't match the query.
// Assuming one compound index can optimize every type of sorting.

//
