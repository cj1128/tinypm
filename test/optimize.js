const test = require("tape")
const optimize = require("../optimize")

test("optimize", t => {
  const before = {
    name: "root",
    reference: undefined,
    dependencies: [
      {
        name: "a",
        reference: "a1",
        dependencies: [
          {
            name: "c",
            reference: "c1",
            dependencies: [],
          },
          {
            name: "d",
            reference: "d1",
            dependencies: [],
          },
          {
            name: "e",
            reference: "e1",
            dependencies: [],
          },
        ],
      },
      {
        name: "b",
        reference: "b1",
        dependencies: [
          {
            name: "c",
            reference: "c2",
            dependencies: [],
          }
        ],
      },
      {
        name: "c",
        reference: "c1",
        dependencies: [
          {
            name: "e",
            reference:
          }
        ],
      },
    ],
  }

  const after = {
    name: "root",
    reference: undefined,
    dependencies: [
      {
        name: "a",
        reference: "a1",
        dependencies: [],
      },
      {
        name: "b",
        reference: "b1",
        dependencies: [
          {
            name: "c",
            reference: "c2",
            dependencies: [],
          }
        ],
      },
      {
        name: "c",
        reference: "c1",
        dependencies: [],
      },
      {
        name: "d",
        reference: "d1",
        dependencies: [],
      },
      {
        name: "e",
        reference: "e1",
        dependencies: [],
      },
    ],
  }

  t.deepEqual(after, optimize(before))
  t.end()
})
