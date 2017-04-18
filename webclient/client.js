$(function() {
    // Nicked from underscorejs. http://underscorejs.org/#isNaN
    function isNumber(val) {
        return Object.prototype.toString.call(val) == '[object Number]';
    }

    function isNaN(val) {
        return isNumber(val) && val != +val;
    }

    function sortDirection() {
        var isDescending = $('#votesColumn').is('.sortedDescending');
        return isDescending ? 1 : -1;
    }

    // Return + if a > b
    // Return - if b > a
    // Return 0 if a == b
    // Reverse the result if sortDirection is -1 (sort descending)
    function compareByVoteCell(a, b) {
        var $a = $(a), $b = $(b), result;
        var aVotesIntValue = parseInt($a.find('.votes').text()),
            bVotesIntValue = parseInt($b.find('.votes').text());
        if (isNaN(aVotesIntValue) && isNaN(bVotesIntValue))  {
            return 0;
        }
        if (isNaN(aVotesIntValue)) {
            result = -1;
        } else if (isNaN(bVotesIntValue)) {
            result = 1;
        } else {
            result = aVotesIntValue - bVotesIntValue;
        }
        result *= sortDirection();
        return result;
    }

    // Sort all of the rows in the .titles tbody
    function sortByVotes() {
        var rowsOfVotes = $('.titles tbody tr');
        var sortedRows = rowsOfVotes.sort(compareByVoteCell);
        $('.titles tbody').html(sortedRows);
    }

    function toggleSort() {
        sortByVotes();
        if (sortDirection() == 1) {
            $('#votesColumn').removeClass('sortedDescending').addClass('sortedAscending');
        } else {
            $('#votesColumn').removeClass('sortedAscending').addClass('sortedDescending');
        }
    }

    toggleSort();
    $('#votesColumn').on('click', toggleSort);
    window.sortByVotes = sortByVotes;
});
