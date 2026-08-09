// The same album screen, mounted in the Home tab's stack.
//
// Home used to push `/library/album/<id>`, which put the album on the *Library*
// tab's stack: tapping an album in the feed left the Library tab parked on that
// album, so the next tap on Library showed the record you were listening to
// instead of your library. Each tab has to own its own navigation.
//
// One screen, two routes — deliberately a re-export rather than a copy, so the
// album screen never forks.
export { default } from '../../library/album/[id]';
