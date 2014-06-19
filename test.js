require('sugar');

titles = [
  { id: 0,
    author: 'caseyliss',
    title: 'Mac',
    titleLower: 'mac',
    votes: 1,
    votesBy: [ '72.84.250.138' ],
    time: '2014-06-19T17:13:08.448Z'
  },
  { id: 1,
    author: 'caseyliss',
    title: 'Phone',
    titleLower: 'phone',
    votes: 0,
    votesBy: [],
    time: '2014-06-19T17:13:10.815Z'
  }
];

console.log(JSON.stringify(titles, undefined, 2));

var titlesWithVotes = titles.map(function (title) {
    var isVoted = title.votesBy.some(function (testAddress) {
        console.log(testAddress + (testAddress === '72.84.250.138' ? ' = ' : ' <> ') + '72.84.250.138');
        return testAddress === '72.84.250.138';
    });
    var newTitle = Object.clone(title, true);
    newTitle.voted = isVoted;
    return newTitle;
});

console.log('Original: \n' + JSON.stringify(titles, undefined, 2));
console.log('w/ Votes: \n' + JSON.stringify(titlesWithVotes, undefined, 2));
