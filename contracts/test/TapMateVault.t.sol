// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TapMateVault} from "../src/TapMateVault.sol";

contract TapMateVaultTest is Test {
    TapMateVault v;
    uint96 constant CHIP = 0.1 ether;
    uint40 constant D = 300;
    uint40 constant P = 300;
    uint40 constant MAXL = 30 days;
    uint40 LOCK;

    bytes32 constant WAGER_TYPEHASH = keccak256(
        "Wager(address player0,address player1,uint32 chip0,uint32 chip1,uint96 stake,uint40 settleBy,bool player0IsWhite)"
    );
    bytes32 constant MOVE = keccak256("Move(bytes32 gameId,uint16 ply,bytes32 positionHash)");
    bytes32 constant RESULT = keccak256("Result(bytes32 gameId,address winner,uint16 ply,bytes32 finalPositionHash)");
    bytes32 constant CONTEST = keccak256("Contest(bytes32 gameId,uint16 ply)");
    bytes32 constant POS = keccak256("final-fen");
    bytes32 constant PREV = keccak256("prev-fen");

    struct K {
        address a;
        uint256 pk;
    }

    K p0;
    K p1;
    K p2;
    address relayer = makeAddr("relayer");

    function setUp() public {
        vm.warp(1_000_000);
        LOCK = uint40(block.timestamp + 7 days);
        v = new TapMateVault(CHIP, D, P, MAXL);
        K memory a = mk("alice");
        K memory b = mk("bob");
        (p0, p1) = a.a < b.a ? (a, b) : (b, a);
        p2 = mk("carol");
        fund(p0, 3);
        fund(p1, 3);
        fund(p2, 3);
    }

    // ---------- helpers ----------

    function mk(string memory n) internal returns (K memory k) {
        (k.a, k.pk) = makeAddrAndKey(n);
    }

    function fund(K memory k, uint32 chips) internal {
        uint256 amt = uint256(chips) * CHIP * 3;
        vm.deal(k.a, k.a.balance + amt);
        vm.prank(k.a);
        v.deposit{value: amt}(chips, LOCK);
    }

    function wager(K memory a, K memory b, uint32 ca, uint32 cb, bool aWhite)
        internal
        view
        returns (TapMateVault.Wager memory)
    {
        return TapMateVault.Wager(a.a, b.a, ca, cb, CHIP, LOCK, aWhite);
    }

    function sign(K memory k, bytes32 d) internal pure returns (bytes memory) {
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(k.pk, d);
        return abi.encodePacked(r, s, vv);
    }

    function dig(bytes32 h) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", v.domainSeparator(), h));
    }

    function resultOf(TapMateVault.Wager memory w, K memory winner, K memory signer)
        internal
        view
        returns (TapMateVault.Result memory)
    {
        bytes32 g = v.hashWager(w);
        bytes memory sig = sign(signer, dig(keccak256(abi.encode(RESULT, g, winner.a, uint16(40), POS))));
        return TapMateVault.Result(winner.a, 40, POS, sig);
    }

    function moveSig(K memory k, bytes32 g, uint16 ply, bytes32 pos) internal view returns (bytes memory) {
        return sign(k, dig(keccak256(abi.encode(MOVE, g, ply, pos))));
    }

    function settle(TapMateVault.Wager memory w, K memory a, K memory b, TapMateVault.Result memory r) internal {
        bytes32 g = v.hashWager(w);
        v.settle(w, sign(a, g), sign(b, g), r);
    }

    /// p0 is white, so p0 signs odd plies and p1 signs even plies.
    function fileClaim(TapMateVault.Wager memory w, uint16 ply, K memory mover, K memory other) internal {
        bytes32 g = v.hashWager(w);
        v.claim(
            w,
            sign(p0, g),
            sign(p1, g),
            TapMateVault.ClaimProof(ply, POS, moveSig(mover, g, ply, POS), PREV, moveSig(other, g, ply - 1, PREV))
        );
    }

    function contestSig(K memory k, bytes32 g, uint16 ply) internal view returns (bytes memory) {
        return sign(k, dig(keccak256(abi.encode(CONTEST, g, ply))));
    }

    // ---------- settle ----------

    function test_settle_paysSignedWinner_notSubmitter() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        uint256 before = p0.a.balance;
        vm.prank(relayer);
        settle(w, p0, p1, resultOf(w, p0, p1));
        assertEq(p0.a.balance, before + 2 * CHIP);
        assertEq(relayer.balance, 0);
        assertEq(v.consumedBy(p0.a, 0), v.hashWager(w));
        assertEq(v.consumedBy(p1.a, 0), v.hashWager(w));
    }

    function test_settle_player1CanWin() public {
        TapMateVault.Wager memory w = wager(p0, p1, 1, 2, false);
        uint256 before = p1.a.balance;
        settle(w, p0, p1, resultOf(w, p1, p0));
        assertEq(p1.a.balance, before + 2 * CHIP);
    }

    function test_settle_rejectsWinnerSigningOwnResult() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        TapMateVault.Result memory r = resultOf(w, p0, p0);
        bytes32 g = v.hashWager(w);
        bytes memory s0 = sign(p0, g);
        bytes memory s1 = sign(p1, g);
        vm.expectRevert(TapMateVault.BadSig.selector);
        v.settle(w, s0, s1, r);
    }

    function test_settle_rejectsThirdPartyWinner() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        TapMateVault.Result memory r = resultOf(w, p2, p1);
        bytes32 g = v.hashWager(w);
        bytes memory s0 = sign(p0, g);
        bytes memory s1 = sign(p1, g);
        vm.expectRevert(TapMateVault.BadWinner.selector);
        v.settle(w, s0, s1, r);
    }

    function test_settle_rejectsReplay() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        TapMateVault.Result memory r = resultOf(w, p0, p1);
        settle(w, p0, p1, r);
        bytes32 g = v.hashWager(w);
        bytes memory s0 = sign(p0, g);
        bytes memory s1 = sign(p1, g);
        vm.expectRevert(abi.encodeWithSelector(TapMateVault.ChipSpent.selector, p0.a, uint32(0), g));
        v.settle(w, s0, s1, r);
    }

    function test_settle_rejectsResultFromAnotherGame() public {
        TapMateVault.Wager memory w1 = wager(p0, p1, 0, 0, true);
        TapMateVault.Wager memory w2 = wager(p0, p1, 1, 1, true);
        TapMateVault.Result memory r = resultOf(w1, p0, p1);
        bytes32 g = v.hashWager(w2);
        bytes memory s0 = sign(p0, g);
        bytes memory s1 = sign(p1, g);
        vm.expectRevert(TapMateVault.BadSig.selector);
        v.settle(w2, s0, s1, r);
    }

    function test_settle_rejectsMissingOpponentWagerSig() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        TapMateVault.Result memory r = resultOf(w, p0, p1);
        bytes32 g = v.hashWager(w);
        bytes memory s0 = sign(p0, g);
        vm.expectRevert(TapMateVault.BadSig.selector);
        v.settle(w, s0, s0, r);
    }

    function test_settle_rejectsAfterExpiry() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        TapMateVault.Result memory r = resultOf(w, p0, p1);
        bytes32 g = v.hashWager(w);
        bytes memory s0 = sign(p0, g);
        bytes memory s1 = sign(p1, g);
        vm.warp(uint256(LOCK) + 1);
        vm.expectRevert(TapMateVault.Expired.selector);
        v.settle(w, s0, s1, r);
    }

    function test_settle_rejectsWrongStake() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        w.stake = CHIP + 1;
        TapMateVault.Result memory r = resultOf(w, p0, p1);
        bytes32 g = v.hashWager(w);
        bytes memory s0 = sign(p0, g);
        bytes memory s1 = sign(p1, g);
        vm.expectRevert(TapMateVault.BadStake.selector);
        v.settle(w, s0, s1, r);
    }

    function test_settle_rejectsUnfundedChip() public {
        TapMateVault.Wager memory w = wager(p0, p1, 99, 0, true);
        TapMateVault.Result memory r = resultOf(w, p0, p1);
        bytes32 g = v.hashWager(w);
        bytes memory s0 = sign(p0, g);
        bytes memory s1 = sign(p1, g);
        vm.expectRevert(TapMateVault.ChipOutOfRange.selector);
        v.settle(w, s0, s1, r);
    }

    function test_settle_rejectsSettleByPastLock() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        w.settleBy = LOCK + 1;
        TapMateVault.Result memory r = resultOf(w, p0, p1);
        bytes32 g = v.hashWager(w);
        bytes memory s0 = sign(p0, g);
        bytes memory s1 = sign(p1, g);
        vm.expectRevert(TapMateVault.LockTooShort.selector);
        v.settle(w, s0, s1, r);
    }

    // ---------- double spend ----------

    function test_doubleSpend_chipEarnsOnce_thenSlashable() public {
        // p0 signs chip 0 to p1 and again to p2, and loses both.
        TapMateVault.Wager memory first = wager(p0, p1, 0, 0, true);
        (K memory lo, K memory hi) = p0.a < p2.a ? (p0, p2) : (p2, p0);
        TapMateVault.Wager memory second = wager(lo, hi, 0, 0, true);
        settle(first, p0, p1, resultOf(first, p1, p0));

        TapMateVault.Result memory r = resultOf(second, p2, p0);
        bytes32 g2 = v.hashWager(second);
        bytes memory sLo = sign(lo, g2);
        bytes memory sHi = sign(hi, g2);
        vm.expectRevert();
        v.settle(second, sLo, sHi, r);

        _assertSlashes(second, g2, lo.a == p0.a);
    }

    function _assertSlashes(TapMateVault.Wager memory second, bytes32 g2, bool cheaterIsLow) internal {
        (,,,, uint96 bondBefore) = v.vaults(p0.a);
        uint256 victimBefore = p2.a.balance;
        uint256 burnBefore = v.BURN().balance;
        bytes memory cheaterSig = sign(p0, g2);
        v.reportDoubleSpend(second, cheaterSig, cheaterIsLow);
        (,,,, uint96 bondAfter) = v.vaults(p0.a);
        assertEq(bondBefore - bondAfter, 2 * CHIP);
        assertEq(p2.a.balance, victimBefore + CHIP);
        assertEq(v.BURN().balance, burnBefore + CHIP);

        vm.expectRevert(TapMateVault.AlreadySlashed.selector);
        v.reportDoubleSpend(second, cheaterSig, cheaterIsLow);
    }

    function test_report_rejectsSameGame() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        settle(w, p0, p1, resultOf(w, p0, p1));
        bytes memory sig = sign(p1, v.hashWager(w));
        vm.expectRevert(TapMateVault.NoConflict.selector);
        v.reportDoubleSpend(w, sig, false);
    }

    function test_report_rejectsUnspentChip() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        bytes memory sig = sign(p1, v.hashWager(w));
        vm.expectRevert(TapMateVault.NoConflict.selector);
        v.reportDoubleSpend(w, sig, false);
    }

    // ---------- claim, contest, forfeit ----------

    function test_claim_silentOpponentForfeits() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        fileClaim(w, 41, p0, p1);
        vm.expectRevert(TapMateVault.ClaimOpen.selector);
        v.claimForfeit(w);
        vm.warp(block.timestamp + D + 1);
        uint256 before = p0.a.balance;
        vm.prank(relayer);
        v.claimForfeit(w);
        assertEq(p0.a.balance, before + 2 * CHIP);
        assertEq(relayer.balance, 0);
    }

    function test_claim_blackMoverIsClaimant() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        fileClaim(w, 40, p1, p0);
        vm.warp(block.timestamp + D + 1);
        uint256 before = p1.a.balance;
        v.claimForfeit(w);
        assertEq(p1.a.balance, before + 2 * CHIP);
    }

    function test_claim_rejectsWrongTurnSignature() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        bytes32 g = v.hashWager(w);
        // ply 41 belongs to white (p0), but p1 signed it.
        TapMateVault.ClaimProof memory proof =
            TapMateVault.ClaimProof(41, POS, moveSig(p1, g, 41, POS), PREV, moveSig(p0, g, 40, PREV));
        bytes memory s0 = sign(p0, g);
        bytes memory s1 = sign(p1, g);
        vm.expectRevert(TapMateVault.BadSig.selector);
        v.claim(w, s0, s1, proof);
    }

    function test_claim_rejectsFabricatedOpponentMove() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        bytes32 g = v.hashWager(w);
        TapMateVault.ClaimProof memory proof =
            TapMateVault.ClaimProof(41, POS, moveSig(p0, g, 41, POS), PREV, moveSig(p0, g, 40, PREV));
        bytes memory s0 = sign(p0, g);
        bytes memory s1 = sign(p1, g);
        vm.expectRevert(TapMateVault.BadSig.selector);
        v.claim(w, s0, s1, proof);
    }

    function test_claim_rejectsEarlyPly() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        bytes32 g = v.hashWager(w);
        TapMateVault.ClaimProof memory proof = TapMateVault.ClaimProof(1, POS, moveSig(p0, g, 1, POS), PREV, "");
        bytes memory s0 = sign(p0, g);
        bytes memory s1 = sign(p1, g);
        vm.expectRevert(TapMateVault.BadPly.selector);
        v.claim(w, s0, s1, proof);
    }

    function test_claim_onlyOnePerGame() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        fileClaim(w, 41, p0, p1);
        bytes32 g = v.hashWager(w);
        TapMateVault.ClaimProof memory proof =
            TapMateVault.ClaimProof(42, POS, moveSig(p1, g, 42, POS), PREV, moveSig(p0, g, 41, PREV));
        bytes memory s0 = sign(p0, g);
        bytes memory s1 = sign(p1, g);
        vm.expectRevert(TapMateVault.ClaimExists.selector);
        v.claim(w, s0, s1, proof);
    }

    function test_contest_voidsClaim_fundsStayInVault() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        fileClaim(w, 41, p0, p1);
        bytes32 g = v.hashWager(w);
        v.contest(w, contestSig(p1, g, 41));
        vm.warp(block.timestamp + D + 1);
        vm.expectRevert(TapMateVault.NoClaim.selector);
        v.claimForfeit(w);
        assertEq(v.consumedBy(p0.a, 0), bytes32(0));
        assertEq(v.consumedBy(p1.a, 0), bytes32(0));
    }

    function test_contest_claimCannotBeRefiled() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        fileClaim(w, 41, p0, p1);
        bytes32 g = v.hashWager(w);
        v.contest(w, contestSig(p1, g, 41));
        TapMateVault.ClaimProof memory proof =
            TapMateVault.ClaimProof(43, POS, moveSig(p0, g, 43, POS), PREV, moveSig(p1, g, 42, PREV));
        bytes memory s0 = sign(p0, g);
        bytes memory s1 = sign(p1, g);
        vm.expectRevert(TapMateVault.ClaimExists.selector);
        v.claim(w, s0, s1, proof);
    }

    function test_contest_rejectsClaimantSigningOwnContest() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        fileClaim(w, 41, p0, p1);
        bytes memory sig = contestSig(p0, v.hashWager(w), 41);
        vm.expectRevert(TapMateVault.BadSig.selector);
        v.contest(w, sig);
    }

    function test_contest_rejectsAfterDeadline() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        fileClaim(w, 41, p0, p1);
        bytes memory sig = contestSig(p1, v.hashWager(w), 41);
        vm.warp(block.timestamp + D + 1);
        vm.expectRevert(TapMateVault.ClaimOver.selector);
        v.contest(w, sig);
    }

    function test_signedResultBeatsContest() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        fileClaim(w, 41, p0, p1);
        bytes32 g = v.hashWager(w);
        v.contest(w, contestSig(p1, g, 41));
        uint256 before = p0.a.balance;
        settle(w, p0, p1, resultOf(w, p0, p1));
        assertEq(p0.a.balance, before + 2 * CHIP);
    }

    function test_forfeit_cannotPayAfterSettle() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        fileClaim(w, 40, p1, p0);
        settle(w, p0, p1, resultOf(w, p0, p1));
        vm.warp(block.timestamp + D + 1);
        vm.expectRevert(abi.encodeWithSelector(TapMateVault.ChipSpent.selector, p0.a, uint32(0), v.hashWager(w)));
        v.claimForfeit(w);
    }

    // ---------- vault ----------

    function test_deposit_rejectsWrongValue() public {
        vm.deal(p0.a, 10 ether);
        vm.prank(p0.a);
        vm.expectRevert(TapMateVault.BadDeposit.selector);
        v.deposit{value: CHIP}(1, LOCK);
    }

    function test_deposit_lockCannotDecrease() public {
        vm.deal(p0.a, 10 ether);
        vm.prank(p0.a);
        vm.expectRevert(TapMateVault.BadLock.selector);
        v.deposit{value: 3 * uint256(CHIP)}(1, LOCK - 1);
    }

    function test_deposit_lockCannotExceedMax() public {
        vm.deal(p0.a, 10 ether);
        vm.prank(p0.a);
        vm.expectRevert(TapMateVault.BadLock.selector);
        v.deposit{value: 3 * uint256(CHIP)}(1, uint40(block.timestamp) + MAXL + 1);
    }

    function test_withdraw_lockedUntilAllWindowsPass() public {
        vm.warp(uint256(LOCK) + D + P);
        vm.prank(p0.a);
        vm.expectRevert(TapMateVault.StillLocked.selector);
        v.withdraw(payable(p0.a));
        vm.warp(block.timestamp + 1);
        uint256 before = p0.a.balance;
        vm.prank(p0.a);
        v.withdraw(payable(p0.a));
        assertEq(p0.a.balance, before + 9 * uint256(CHIP));
    }

    function test_withdraw_accountsForLostChip() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        settle(w, p0, p1, resultOf(w, p1, p0));
        vm.warp(uint256(LOCK) + D + P + 1);
        uint256 before = p0.a.balance;
        vm.prank(p0.a);
        v.withdraw(payable(p0.a));
        assertEq(p0.a.balance, before + 8 * uint256(CHIP));
    }

    function test_withdraw_retiresChipsSoOldTicketsFail() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        fileClaim(w, 41, p0, p1);
        vm.warp(uint256(LOCK) + D + P + 1);
        vm.prank(p1.a);
        v.withdraw(payable(p1.a));
        vm.expectRevert(TapMateVault.ChipOutOfRange.selector);
        v.claimForfeit(w);
    }

    function test_voidedGameChipsReturnAtWithdraw() public {
        TapMateVault.Wager memory w = wager(p0, p1, 0, 0, true);
        fileClaim(w, 41, p0, p1);
        v.contest(w, contestSig(p1, v.hashWager(w), 41));
        vm.warp(uint256(LOCK) + D + P + 1);
        uint256 before = p1.a.balance;
        vm.prank(p1.a);
        v.withdraw(payable(p1.a));
        assertEq(p1.a.balance, before + 9 * uint256(CHIP));
    }

    // ---------- fuzz ----------

    function testFuzz_winnerGetsExactlyTwoStakes(bool p0Wins, uint8 c0, uint8 c1) public {
        uint32 chip0 = c0 % 3;
        uint32 chip1 = c1 % 3;
        TapMateVault.Wager memory w = wager(p0, p1, chip0, chip1, p0Wins);
        (K memory winner, K memory loser) = p0Wins ? (p0, p1) : (p1, p0);
        uint256 beforeWinner = winner.a.balance;
        uint256 beforeLoser = loser.a.balance;
        uint256 beforeVault = address(v).balance;
        settle(w, p0, p1, resultOf(w, winner, loser));
        assertEq(winner.a.balance, beforeWinner + 2 * CHIP);
        assertEq(loser.a.balance, beforeLoser);
        assertEq(address(v).balance, beforeVault - 2 * CHIP);
    }

    function testFuzz_settlementNeverBreaksSolvency(uint8 games) public {
        uint256 n = bound(games, 1, 3);
        for (uint32 i = 0; i < n; i++) {
            TapMateVault.Wager memory w = wager(p0, p1, i, i, true);
            settle(w, p0, p1, resultOf(w, i % 2 == 0 ? p0 : p1, i % 2 == 0 ? p1 : p0));
        }
        uint256 owed;
        address[3] memory all = [p0.a, p1.a, p2.a];
        for (uint256 i = 0; i < 3; i++) {
            (uint32 s, uint32 e, uint32 c,, uint96 b) = v.vaults(all[i]);
            owed += uint256(e - s - c) * CHIP + b;
        }
        assertEq(address(v).balance, owed);
    }
}
