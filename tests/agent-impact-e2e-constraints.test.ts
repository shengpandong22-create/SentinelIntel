import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateProductConstraints } from "../scripts/run-impact-e2e.ts";

// Revision 6 product-level constraints for the unsupported-version-format demonstration.

const expected = {
  review_required_products: ["Windows 10 1507", "Windows Server 2022"],
  claims_forbidden_products: ["Windows 10 1507", "Windows Server 2022"],
  review_unknown_contains: ["matcher-unsupported"],
};

const routedReview = (product: string, supported = false) => ({
  reason: `medium-confidence impact row needs review: ${product}`,
  payload: {
    product,
    affected_range: { raw: "<10.0.10240.20232", supported },
    fixed_range: null,
  },
});

test("required products routed to review with unsupported ranges pass, and versionless claims for other products stay legal", () => {
  const errors = evaluateProductConstraints(expected, {
    reviews: [routedReview("Windows 10 1507"), routedReview("Windows Server 2022")],
    claimsProducts: ["Windows Server 2008", "Windows Server 2012"],
    proposalUnknowns: ["Matcher-unsupported version expressions routed to human review: Windows 10 1507, Windows Server 2022."],
  });
  assert.deepEqual(errors, []);
});

test("a review for the wrong product cannot satisfy a required product", () => {
  const errors = evaluateProductConstraints(expected, {
    reviews: [routedReview("Windows 10 1607"), routedReview("Windows Server 2022")],
    claimsProducts: [],
    proposalUnknowns: ["Matcher-unsupported version expressions routed to human review: Windows 10 1607, Windows Server 2022."],
  });
  assert.match(errors.join("; "), /review-required product 'Windows 10 1507'/);
});

test("a review whose range is matcher-supported does not satisfy the constraint", () => {
  const errors = evaluateProductConstraints(expected, {
    reviews: [routedReview("Windows 10 1507", true), routedReview("Windows Server 2022")],
    claimsProducts: [],
    proposalUnknowns: ["Matcher-unsupported version expressions routed to human review: Windows Server 2022."],
  });
  assert.match(errors.join("; "), /review-required product 'Windows 10 1507'/);
});

test("a claims-forbidden product persisting as claims fails the constraint", () => {
  const errors = evaluateProductConstraints(expected, {
    reviews: [routedReview("Windows 10 1507"), routedReview("Windows Server 2022")],
    claimsProducts: ["Windows Server 2008", "Windows 10 1507"],
    proposalUnknowns: ["Matcher-unsupported version expressions routed to human review: Windows 10 1507, Windows Server 2022."],
  });
  assert.match(errors.join("; "), /claims-forbidden product 'Windows 10 1507'/);
});

test("the matcher refusal must be surfaced in unknowns or review reasons", () => {
  const errors = evaluateProductConstraints(expected, {
    reviews: [routedReview("Windows 10 1507"), routedReview("Windows Server 2022")],
    claimsProducts: [],
    proposalUnknowns: ["Some unrelated unknown."],
  });
  assert.match(errors.join("; "), /matcher-unsupported refusal not surfaced/);
});

test("product names match case-insensitively and no constraints means no errors", () => {
  const errors = evaluateProductConstraints(expected, {
    reviews: [routedReview("windows 10 1507"), routedReview("WINDOWS SERVER 2022")],
    claimsProducts: ["Windows Server 2008"],
    proposalUnknowns: ["matcher-unsupported"],
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(evaluateProductConstraints(
    { review_required_products: [], claims_forbidden_products: [], review_unknown_contains: [] },
    { reviews: [], claimsProducts: ["anything"], proposalUnknowns: [] },
  ), []);
});
