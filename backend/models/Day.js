const mongoose = require('mongoose');
const { Schema } = mongoose;

//! TOPIC: const { Schema } = mongoose;

// Importance: ⭐⭐⭐⭐⭐
// Difficulty: ⭐⭐☆☆☆
// Interview Frequency: Very High

// WHY THIS CODE EXISTS

// const { Schema } = mongoose;

// This line extracts the `Schema` property from the `mongoose` object
// and stores it in a new variable called `Schema`.
//
// Instead of writing:
// mongoose.Schema
//
// everywhere in the file, we can simply write:
// Schema
//
// This makes the code shorter, cleaner, and easier to read.

// CODE EXPLANATION

// const
// Declares a constant variable.
// Since the Schema reference never changes,
// const is the best choice.

// { Schema }
// This is called Object Destructuring.
// It extracts a property named "Schema"
// from an object.

// = mongoose
// The object from which we are extracting
// the Schema property.

// The line:
//
// const { Schema } = mongoose;
//
// is exactly equivalent to:
//
// const Schema = mongoose.Schema;
//
// Both lines produce the same result.
// Object destructuring is simply shorter
// and is the preferred modern JavaScript syntax.

// Example:

// const person = {
//     name: "Bikram",
//     age: 20
// };

// const { name } = person;

// is equivalent to:

// const name = person.name;

// After destructuring:

// console.log(name);

// Output:
// Bikram
//! IMPORTANT CONCEPTS

// What is Object Destructuring?

// Object destructuring is an ES6 JavaScript feature
// that allows us to extract properties
// from an object into separate variables.

// Example:

// const car = {
//     brand: "BMW",
//     year: 2024
// };

// const { brand, year } = car;

// Instead of writing:

// car.brand
// car.year

// we can simply write:

// brand
// year

// Why is it useful?

// Imagine the mongoose object has
// hundreds of properties:
//
// mongoose.Schema
// mongoose.model
// mongoose.connect
// mongoose.Types
// mongoose.connection
// mongoose.version

// If you only need Schema,
// destructuring lets you extract
// just that property.

// Why is Schema capitalized?

// Schema is a constructor (or class-like object)
// provided by Mongoose.
//
// By JavaScript convention,
// constructors are written in PascalCase.
//
// Examples:
//
// Date
// Map
// Set
// Promise
// Error
// Schema

// INDUSTRY BEST PRACTICES

// Use object destructuring when accessing
// frequently used properties.
//
// It improves readability
// and reduces repetitive code.
//
// Avoid destructuring properties
// that are used only once,
// as it can make code less clear.

// QUICK REVISION

// { Schema } is object destructuring.
// It extracts the Schema property
// from the mongoose object.
// It is equivalent to:
// const Schema = mongoose.Schema;
// This is modern JavaScript syntax
// used heavily in Node.js projects.

// THINGS TO REMEMBER

// Object destructuring only works
// if the property exists.
//
// { Schema } looks for a property
// literally named "Schema".
//
// Variable name and property name
// are the same in this example.
//! INTERVIEW QUESTIONS

// Q1. What is object destructuring?

// Object destructuring is a JavaScript feature
// that extracts properties from an object
// into separate variables.

// Q2. Is this line different from
// const Schema = mongoose.Schema;

// No.
// Both are functionally equivalent.
// Object destructuring is simply
// cleaner and more concise.

// Q3. Why is Schema written with a capital S?

// Because Schema is a constructor/class-like object.
// By convention, constructors use PascalCase.

// Q4. What happens if the property doesn't exist?

// Example:
//
// const obj = {};
// const { age } = obj;
//
// age becomes undefined.
// JavaScript does not throw an error
// during destructuring in this case.

// Q5. Can we extract multiple properties?

// Yes.

// Example:

// const {
//     Schema,
//     model,
//     connect
// } = mongoose;

// COMMON MISTAKES

// Thinking { } creates a new object.
// Here, { } is destructuring syntax,
// not an object literal.

// Thinking destructuring copies the object.
// It only extracts references or values
// into new variables.

// Confusing object destructuring
// with array destructuring.
//
// Object:
// const { name } = person;
//
// Array:
// const [first] = numbers;

// Q3. What happens if Schema doesn't exist?
// ans - undefined
// does not throw error

// Task subdocument schema




const TaskSchema = new mongoose.Schema({

//! Q1. What is the purpose of the new keyword?
// Your Answer

// It calls the constructor and creates a new object with the desired schema fields and then returns the object...

// Evaluation

// ⭐⭐⭐⭐⭐ 9.5/10

// Very good.

// You correctly mentioned:

// ✅ Calls the constructor
// ✅ Creates a new object
// ✅ Returns the object

// One small correction:

// You said:

// "creates a new object with the desired schema fields"

// That's true for mongoose.Schema, but not for every use of new.

// Remember:

// new Date()
// new Promise()
// new Map()
// new Error()

// These don't create "schema fields."

// So the definition should be more general.

// Interview-Ready Answer

// The new keyword is a JavaScript keyword used to create a new object from a constructor. It creates the object, calls the constructor to initialize it, and returns the newly created object.

// Q2. Who creates the object?
// Your Answer

// JavaScript engine creates the object by calling the constructor of Mongoose.

// Evaluation

// ⭐⭐⭐⭐⭐ 10/10

// Perfect.

// This is something many developers don't know.

// It is not Mongoose creating the object.

// It is the JavaScript engine (V8).

// Mongoose only provides the constructor.

// Excellent.

// Q3. Four Steps
// Your Answer

// It creates an empty object then initializes it then returns it.

// Evaluation

// 8.5/10

// Good idea, but you missed one very important step.

// The actual order is:

// Create an empty object.
// Link that object to the constructor's prototype.
// Call the constructor with this pointing to the new object.
// Return the object.

// The prototype step is extremely important because that's what enables inheritance and methods like:

// user.save()
// user.validate()

// Don't worry if you don't fully understand prototypes yet—we'll cover them later. For now, just know there is a hidden step between creating the object and calling the constructor.

// Q4. Difference between
// mongoose.Schema

// and

// new mongoose.Schema()
// Your Answer

// new mongoose.Schema asks the constructor to create an object... mongoose.Schema alone doesn't...

// Evaluation

// ⭐⭐⭐⭐⭐ 9.5/10

// Very good.

// I'd just make it a little more precise.

// Here's the difference:

// mongoose.Schema

// This is just the constructor itself.

// Think of it like a factory machine.

// Nothing has been produced yet.

// new mongoose.Schema()

// Now you're saying:

// Use this factory to build me a brand new Schema object.

// The result is an actual object.

  title: {
    type: String,
    required: true,
    trim: true,
  },


  //! Q1. Is this a document?
  // {
//     title: {
//         type: String
//     }
// }
// Your Answer

// It is not a document, it is a schema object...

// Evaluation

// ⭐⭐⭐⭐⭐ 9.5/10

// Very good, but there's one small correction.

// This is not yet a Schema object.

// It is the Schema Definition Object.

// Remember the sequence:

// JavaScript Object
//         │
//         ▼
// Passed into

// new mongoose.Schema()

//         │
//         ▼
// Schema Object
//         │
//         ▼
// Model
//         │
//         ▼
// Documents

// So:

// {
//     title: {
//         type: String
//     }
// }

// is still just a plain JavaScript object.

// After passing it to:

// new mongoose.Schema(...)

// it becomes part of a Schema object.

// This distinction is small, but it's important.

// Q2. Why pass this object to new mongoose.Schema()?
// Your Answer

// We pass it so the constructor makes the object according to the rules...

// Evaluation

// ⭐⭐⭐⭐⭐ 10/10

// Excellent.

// You have understood the purpose.

// The constructor reads the rules and creates a Schema object from them.

// Perfect.

// Q3. What if we write
// new mongoose.Schema({})
// Your Answer

// Infinite possibilities...

// Evaluation

// ⭐⭐⭐⭐☆ 6.5/10

// This is the only answer I want to correct.

// The question was a little tricky.

// Let's think together.

// You wrote:

// new mongoose.Schema({})

// Notice...

// The object is empty.

// That means you're telling Mongoose:

// "I have no predefined fields."

// So what kind of documents can we create?

// There are two answers depending on configuration.

// Default Behavior (strict: true)

// If you later do:

// const User = mongoose.model("User", new mongoose.Schema({}));

// const user = new User({
//     name: "Bikram",
//     age: 20
// });

// Since the schema defines no fields, Mongoose will ignore fields that aren't in the schema (with the default strict: true).

// The stored document will effectively contain none of those undefined fields.

// If strict: false

// Now imagine:

// new mongoose.Schema({}, {
//     strict: false
// });

// Now Mongoose allows any fields.

// You could store

// {
//     name: "Bikram",
//     age: 20,
//     anything: "Yes"
// }

// or

// {
//     xyz: true
// }

// or

// {
//     hello: "world"
// }

// So your idea about flexibility is correct only when strict: false is enabled.

// Because we haven't reached strict yet in the lesson, this question was intentionally a bit difficult.

// Q4. Why use an object?
// Your Answer

// Because key-value pairs...

// Evaluation

// ⭐⭐⭐⭐⭐ 10/10

// Excellent.

// Exactly.

// An object naturally represents

// Field Name
// ↓

// Configuration

// For example

// title
// ↓

// {
//     type: String,
//     required: true
// }

// An array cannot express this relationship nearly as clearly.

  completed: {
    type: Boolean,
    default: false,
  },


  //! INTERVIEW QUESTIONS

// Q1. What is the object passed to new mongoose.Schema()?

// It is a schema definition object.
// It describes the fields,
// datatypes,
// validations,
// and rules for future documents.

// Q2. Is this object stored in MongoDB?

// No.
//
// Only documents are stored in MongoDB.
// This object is used only to create
// the Schema object.

// Q3. Why is an object used instead of another datatype?

// Because objects allow us to define
// field names and their configurations
// using key-value pairs,
// making the schema readable and flexible.

// Q4. Does this object contain actual data?

// No.
//
// It contains metadata (rules)
// about how future data should look.

// COMMON MISTAKES

// Thinking this object is inserted into MongoDB.
// Confusing schema definitions with documents.
// Assuming Mongoose stores the schema itself
// inside the database.


  // Allow additional metadata for LeetCode problems
  
  
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { strict: false }); // Allow additional fields


  //! Q1. Difference between mongoose.Schema and TaskSchema
// Your Answer

// mongoose.Schema is the constructor used to create objects and TaskSchema is the object created by that constructor.

// Evaluation
// ⭐⭐⭐⭐⭐ 10/10

// Perfect.

// This is exactly what I wanted you to understand.

// If an interviewer asked this, I'd be satisfied with this answer.

// One small improvement:

// Instead of saying

// "create object"

// say

// "create Schema objects."

// Because constructors create different kinds of objects.

// Example:

// new Date()

// creates a Date object.

// new Error()

// creates an Error object.

// new mongoose.Schema()

// creates a Schema object.

// Being specific makes your answer stronger.

// Q2. Why don't we write
// new TaskSchema()
// Your Answer

// mongoose.Schema is the constructor...

// TaskSchema is the object...

// Evaluation
// ⭐⭐⭐⭐⭐ 10/10

// Excellent.

// This is actually a difficult concept.

// Think about it.

// Can you build another house using...

// a blueprint?

// No.

// The blueprint already exists.

// You don't use the blueprint to make another blueprint.

// You use the blueprint machine (constructor).

// Exactly the same thing happens here.

// mongoose.Schema
//         │
//         ▼
// Creates
//         │
//         ▼
// TaskSchema

// Once TaskSchema exists,

// it is already the finished Schema object.

// It is not another constructor.

// Therefore

// new TaskSchema()

// makes no sense.

// Q3. Can one constructor create multiple Schema objects?
// Your Answer

// Yes...

// TaskSchema

// CategorySchema

// Evaluation
// ⭐⭐⭐⭐⭐ 10/10

// Perfect.

// This is exactly how Mongoose works.

// One constructor.

// Many Schema objects.

// Later you'll also have

// UserSchema

// GroupSchema

// NotificationSchema

// ChatSchema

// All created by

// mongoose.Schema


// Category subdocument schema


const CategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  tasks: [TaskSchema],
});


//! Q1. Why are these two definitions equivalent?
// title: String

// and

// title: {
//     type: String
// }
// Your Answer

// They are equivalent because both enforce the String datatype...

// Evaluation
// ⭐⭐⭐⭐⭐ 10/10

// Excellent.

// You also added that one uses shorthand syntax while the other uses a field definition object.

// That's exactly what I wanted.

// One tiny improvement:

// Instead of saying

// "they enforce the same rules"

// say

// "they define the same datatype."

// Why?

// Because in the shorthand version there are actually no validation rules.

// Only the datatype.

// So a slightly better answer is:

// Both are equivalent because they define the same datatype (String). The first is shorthand syntax, while the second is the full field definition object. As long as no additional options are provided, Mongoose interprets both in the same way.

// Q2. Why do professionals prefer the object syntax?
// Your Answer

// Easily extendable...

// Evaluation
// ⭐⭐⭐⭐⭐ 10/10

// Perfect.

// This is exactly the reason.

// Notice something.

// You're now using words like

// extendable

// instead of

// because everyone uses it

// That's how engineers think.

// Q3. What change would you make?
// Your Answer

// Convert it into a field definition object...

// Evaluation
// ⭐⭐⭐⭐⭐ 10/10

// Perfect.

// Exactly.

// You understood why the object syntax exists.

// Q4. Why is required inside the title object?
// Your Answer

// If it is outside then it becomes another field...

// Evaluation
// ⭐⭐⭐⭐⭐ 10/10

// Excellent.

// This is actually a harder question than it looks.

// Let's prove it.

// Suppose someone writes

// new Schema({

//     title: String,

//     required: true

// })

// What does Mongoose see?

// It sees TWO fields.

// title

// required

// It does NOT understand

// title is required

// It understands

// there is another field called required.

// Exactly like

// new Schema({

//     title: String,

//     age: Number

// })

// Both are fields.

// So your reasoning is completely correct.


// Day (main) schema



const DaySchema = new mongoose.Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: {
      type: String, // stored as YYYY-MM-DD string for easy comparison
      required: true,
    },
    categories: [CategorySchema],
    summary: {
      type: String,
      default: '',
    },
    aiSummary: {
      type: String,
      default: '',
    },
    hasScratchpad: {
      type: Boolean,
      default: false,
    },
    screenTimeStats: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    graceApplied: {
      type: Boolean,
      default: false,
    },
    reminder: {
      enabled: {
        type: Boolean,
        default: false,
      },
      time: {
        type: String,
        default: "",
      },
      type: {
        type: String,
        enum: ['notification', 'alarm'],
        default: 'notification',
      },
      selectedTasks: [{
        type: mongoose.Schema.Types.ObjectId,
      }],
    },
  },
  { timestamps: true }
);

// Compound unique index: each user can only have one entry per date
DaySchema.index({ userId: 1, date: 1 }, { unique: true });


module.exports = mongoose.model('Day', DaySchema);

//! ⭐⭐⭐⭐⭐ Interview Prep QUESTIONS

// Suppose an interviewer asks:

// Why does JavaScript compare objects by reference instead of by value?

// A strong answer is:

// JavaScript compares objects by reference because checking memory references is very fast (constant time). Comparing object contents would require recursively checking every property, which becomes expensive for large or deeply nested objects. If developers need content comparison, they can explicitly perform a deep equality check.

// That answer would impress most interviewers because it includes both how and why.

//! JAVASCRIPT FUNDAMENTALS - REVISION NOTES (Objects, References, ==, ===)

// ----------------------------------------------------------------------
//! 1. Objects are Compared by Reference, NOT by Value
// ----------------------------------------------------------------------

// Primitive values (Number, String, Boolean, etc.) are compared by VALUE.
//
// Objects, Arrays and Functions are compared by REFERENCE (memory address).
//
// Every new object gets a new memory location.
//
// Example:

// const a = { name: "Bikram" };
// const b = { name: "Bikram" };
//
// a === b
// false
//
// Reason:
// Both objects contain the same data,
// but they are stored at different memory addresses.

// Example:

// const a = { name: "Bikram" };
// const b = a;
//
// a === b
// true
//
// Reason:
// Both variables point to the SAME object in memory.

// Interview Summary:
//
// Primitive values -> Compare Values
// Objects -> Compare References (Memory Addresses)


// ----------------------------------------------------------------------
//! 2. What is a Reference?
// ----------------------------------------------------------------------

// A reference is a value that points to the memory location of an object.
//
// Variables storing objects DO NOT contain the actual object.
// They only store its reference (address).

// Example:

// const obj = {
//     name: "Bikram"
// };
//
// obj
// ↓
//
// Memory Address
// ↓
//
// {
//     name: "Bikram"
// }


// ----------------------------------------------------------------------
//! 3. Primitive Values vs Objects
// ----------------------------------------------------------------------

// Primitive Example:

// const a = "Hello";
// const b = "Hello";
//
// a === b
// true
//
// Reason:
// Primitive values are compared directly by value.

// Object Example:

// const a = new String("Hello");
// const b = new String("Hello");
//
// a === b
// false
//
// Reason:
// new String() creates two different objects,
// therefore two different memory addresses.


// ----------------------------------------------------------------------
//! 4. String Constructor vs Primitive String
// ----------------------------------------------------------------------

// String
// -> JavaScript Constructor Function

// "Hello"
// -> Primitive String

// new String("Hello")
// -> String Object

// typeof String
// "function"

// typeof "Hello"
// "string"

// typeof new String("Hello")
// "object"

// Developers almost always use primitive strings,
// because they are simpler and more memory efficient.


// ----------------------------------------------------------------------
//! 5. Why Does JavaScript Compare Objects by Reference?
// ----------------------------------------------------------------------

// Comparing references is extremely fast.
//
// Comparing object contents would require checking
// every property recursively,
// making comparison expensive for large objects.
//
// Therefore JavaScript compares:
//
// Address A
//
// with
//
// Address B
//
// instead of comparing every field.

// This makes object comparison O(1)
// instead of O(n) for most cases.


// ----------------------------------------------------------------------
//! 6. Strict Equality (===)
// ----------------------------------------------------------------------

// Triple equals compares:
//
// 1. Datatype
// 2. Value (or Reference for objects)
//
// It NEVER performs automatic type conversion.

// Examples:

// 5 === 5
// true

// "5" === 5
// false

// true === 1
// false

// false === 0
// false

// const a = {};
// const b = {};
//
// a === b
// false

// const c = a;
//
// a === c
// true


// ----------------------------------------------------------------------
//! 7. Loose Equality (==)
// ----------------------------------------------------------------------

// Double equals performs automatic type conversion
// before comparing values.
//
// This conversion is called Type Coercion.

// Examples:

// "5" == 5
// true

// false == 0
// true

// true == 1
// true

// null == undefined
// true

// Because JavaScript converts one operand
// according to predefined coercion rules.


// ----------------------------------------------------------------------
//! 8. Type Coercion
// ----------------------------------------------------------------------

// Type Coercion means:
//
// JavaScript automatically converts one datatype
// into another before comparison.

// Example:

// "10" == 10

// Internally behaves approximately like:

// Number("10")
//
// ↓
//
// 10 == 10
//
// ↓
//
// true

// Example:

// false == 0

// Internally:

// Number(false)
//
// ↓
//
// 0 == 0
//
// ↓
//
// true


// ----------------------------------------------------------------------
//! 9. == vs ===
// ----------------------------------------------------------------------

// ==
// Loose Equality
// Performs Type Conversion

// ===
// Strict Equality
// NO Type Conversion

// Industry Best Practice:
//
// Always prefer ===
//
// unless there is a very specific reason
// to use ==


// ----------------------------------------------------------------------
//! 10. Backend Best Practice
// ----------------------------------------------------------------------

// Never rely on JavaScript's implicit type coercion.
//
// Always validate and convert user input first.

// Example:

// const age = Number(req.body.age);
//
// if (age === 18) {
//     ...
// }

// Instead of:

// if (req.body.age == 18)


// ----------------------------------------------------------------------
//! 11. Golden Interview Points
// ----------------------------------------------------------------------

// ✓ Objects are compared by Reference.
//
// ✓ Primitive values are compared by Value.
//
// ✓ String is a Constructor Function.
//
// ✓ "Hello" is a Primitive String.
//
// ✓ new String("Hello") creates a String Object.
//
// ✓ typeof String -> "function"
//
// ✓ typeof "Hello" -> "string"
//
// ✓ typeof new String("Hello") -> "object"
//
// ✓ === compares datatype + value/reference.
//
// ✓ == performs type coercion.
//
// ✓ Always prefer === in production code.
//
// ✓ Never trust frontend input.
// Validate and convert data in the backend.

//! 🔥 Interview Question


// Suppose I ask you:
// console.log(typeof String);

// What do you think the output is?

// A)

// string

// B)

// function

// C)

// object

// Don't guess.

// Think about everything we've learned:

// String is a constructor.
// Constructors in JavaScript are actually a special kind of ________?

// 👉 Answer this first. Once you get it right, you'll have another "mind-blown" moment about JavaScript that will make classes, constructors, and new much easier to understand.

// string Because we are just asking for the type but if we were to create an object using the new keyword it will return a object

// Bikram...

// This is exactly why I asked this question.

// You made a mistake that 80–90% of beginners make, and once you understand the answer, you'll unlock another big piece of JavaScript.

// The correct answer is:

// ❌ Not string

// The answer is:

// ✅ B) function

// Let's prove it.

// If you run this:

// console.log(typeof String);

// Output:

// function

// 🤯

// Wait... Didn't We Say String Is a Constructor?

// Yes!

// And here's the important fact:

// In JavaScript, constructors are functions.

// This is one of the most important JavaScript concepts.

// Think back to what we learned:

// new mongoose.Schema(...)

// We said:

// Schema is a constructor.
// new calls the constructor.

// What we didn't mention yet is:

// That constructor is actually a function.


//! "Why not use MongoDB directly without Mongoose?"

// Don't answer
// "Because Mongoose is easier."
// That's too shallow.

// Instead answer:

// "MongoDB is schema-less, which provides flexibility, but large applications require consistency, validation, relationships, middleware, and maintainability. Mongoose provides these features while still allowing us to use MongoDB."

// That answer sounds like someone who's built real applications.