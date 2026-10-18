const f = new File([""], "test.txt");
console.log(f.path);
f.path = "hello";
console.log(f.path);
Object.defineProperty(f, 'path', { value: "world", configurable: true });
console.log(f.path);
