//
// For guidance on how to create filters see:
// https://prototype-kit.service.gov.uk/docs/filters
//

const govukPrototypeKit = require("govuk-prototype-kit");
const addFilter = govukPrototypeKit.views.addFilter;

// Add your filters here

module.exports = function (env) {
  /**
   * Formats a date into a readable string
   * @param {string} str - date string
   * @returns {string} formatted date
   */
  env.addFilter("date", function (str) {
    if (!str) return "";
    return new Date(str).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  });
};
