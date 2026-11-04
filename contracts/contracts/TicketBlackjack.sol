// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SmemVault} from "./SmemVault.sol";

/// @title TicketBlackjack
/// @notice Blackjack played with Tickets against the dealer. Win more Tickets, or lose the Tickets you bet.
///         1. deal(tickets): you get 2 cards, the dealer gets 1.
///         2. hit(): take a card. Over 21 loses.
///         3. stand(): the dealer draws to 17 or more. The higher total wins.
///         Payouts, including the stake: blackjack (21 with 2 cards) 2.5x, win 2x, tie 1x, loss 0.
/// @dev Cards come from an endless deck. DEMO RANDOMNESS ONLY: the seed uses block data.
contract TicketBlackjack {
    SmemVault public immutable vault;
    uint256 private immutable ticketUnit;
    uint256 private nonce;

    struct Hand {
        uint256 tickets;
        uint8[] player;
        uint8[] dealer;
        bool active;
    }

    mapping(address => Hand) private hands;

    event Dealt(address indexed player, uint256 tickets, uint8[] playerCards, uint8 dealerCard);
    event Hit(address indexed player, uint8 card, uint8 total);
    /// @param result 0 = loss, 1 = tie, 2 = win, 3 = blackjack.
    event Finished(address indexed player, uint8 result, uint8 playerTotal, uint8 dealerTotal, uint256 ticketsWon);

    error HandActive();
    error NoHand();
    error ZeroStake();
    error OnlyEOA();

    constructor(SmemVault vault_) {
        vault = vault_;
        ticketUnit = vault_.TICKET_UNIT();
    }

    function deal(uint256 tickets) external {
        if (tickets == 0) revert ZeroStake();
        if (msg.sender != tx.origin) revert OnlyEOA();
        Hand storage h = hands[msg.sender];
        if (h.active) revert HandActive();

        vault.spendTickets(msg.sender, tickets * ticketUnit);

        delete h.player;
        delete h.dealer;
        h.tickets = tickets;
        h.active = true;
        h.player.push(_draw());
        h.dealer.push(_draw());
        h.player.push(_draw());
        emit Dealt(msg.sender, tickets, h.player, h.dealer[0]);

        // A natural blackjack ends the hand at once.
        if (total(h.player) == 21) _finish(msg.sender);
    }

    function hit() external {
        Hand storage h = hands[msg.sender];
        if (!h.active) revert NoHand();
        uint8 card = _draw();
        h.player.push(card);
        uint8 t = total(h.player);
        emit Hit(msg.sender, card, t);
        if (t > 21) {
            h.active = false;
            emit Finished(msg.sender, 0, t, total(h.dealer), 0);
        } else if (t == 21) {
            _finish(msg.sender);
        }
    }

    function stand() external {
        if (!hands[msg.sender].active) revert NoHand();
        _finish(msg.sender);
    }

    function getHand(address player)
        external
        view
        returns (uint256 tickets, uint8[] memory playerCards, uint8[] memory dealerCards, bool active, uint8 playerTotal, uint8 dealerTotal)
    {
        Hand storage h = hands[player];
        return (h.tickets, h.player, h.dealer, h.active, total(h.player), total(h.dealer));
    }

    /// @notice The best blackjack total. Cards are 1 (ace) to 13 (king). An ace counts 11 unless that busts.
    function total(uint8[] memory cards) public pure returns (uint8) {
        uint256 sum;
        uint256 aces;
        for (uint256 i = 0; i < cards.length; i++) {
            uint8 c = cards[i];
            if (c == 1) {
                aces++;
                sum += 11;
            } else {
                sum += c > 10 ? 10 : c;
            }
        }
        while (sum > 21 && aces > 0) {
            sum -= 10;
            aces--;
        }
        return uint8(sum > 255 ? 255 : sum);
    }

    function _finish(address player) internal {
        Hand storage h = hands[player];
        while (total(h.dealer) < 17) h.dealer.push(_draw());
        h.active = false;

        uint8 p = total(h.player);
        uint8 d = total(h.dealer);
        bool natural = p == 21 && h.player.length == 2;
        uint8 result;
        uint256 won;
        if (natural && !(d == 21 && h.dealer.length == 2)) {
            result = 3;
            won = (h.tickets * ticketUnit * 5) / 2;
        } else if (d > 21 || p > d) {
            result = 2;
            won = h.tickets * ticketUnit * 2;
        } else if (p == d) {
            result = 1;
            won = h.tickets * ticketUnit;
        }
        if (won > 0) vault.creditTickets(player, won);
        emit Finished(player, result, p, d, won);
    }

    function _draw() internal returns (uint8) {
        return uint8(
            uint256(keccak256(abi.encode(block.prevrandao, blockhash(block.number - 1), msg.sender, nonce++))) % 13
        ) + 1;
    }
}
