// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SmemVault
/// @notice Users deposit USDC. At the end of each day, the vault gives Tickets for the USDC
///         that the user held for that whole day. Games spend Tickets and award Prize Points.
/// @dev The Tickets for one day = the lowest balance during that day x ticketsPerUsdcPerDay.
///      A deposit starts to earn on the next full day. A withdrawal lowers the current day.
///      Games can only change Tickets and Prize Points. No game and no owner can move a user's USDC.
contract SmemVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Tickets use 18 decimals. 1e18 is one Ticket.
    uint256 public constant TICKET_UNIT = 1e18;

    IERC20 public immutable usdc;
    uint256 private immutable usdcUnit;

    /// @notice Ticket units that 1 whole USDC earns for 1 full day.
    uint256 public immutable ticketsPerUsdcPerDay;

    /// @notice The length of one day in seconds. The demo uses 10 seconds. Production uses 86400.
    uint256 public immutable dayLength;

    uint256 public totalPrincipal;

    struct Account {
        uint256 principal;
        // Tickets already given for days that ended before lastDay.
        uint256 tickets;
        // The last day on which the account was updated.
        uint256 lastDay;
        // The lowest balance during lastDay. Tickets for lastDay use this amount.
        uint256 eligible;
    }

    mapping(address => Account) private accounts;

    mapping(address => bool) public isGame;

    /// @notice Prize Points per day. They decide each player's share of that day's prize pool.
    mapping(uint256 day => mapping(address => uint256)) public pointsOf;
    mapping(uint256 day => uint256) public totalPointsOf;
    mapping(address => uint256) public lifetimePointsOf;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event TicketsSpent(address indexed user, address indexed game, uint256 amount);
    event TicketsCredited(address indexed user, address indexed game, uint256 amount);
    event PointsAwarded(address indexed user, address indexed game, uint256 indexed day, uint256 points);
    event GameSet(address indexed game, bool allowed);

    error ZeroAmount();
    error ZeroDayLength();
    error InsufficientPrincipal();
    error InsufficientTickets();
    error NotGame();

    modifier onlyGame() {
        if (!isGame[msg.sender]) revert NotGame();
        _;
    }

    constructor(
        IERC20 usdc_,
        uint8 usdcDecimals_,
        uint256 ticketsPerUsdcPerDay_,
        uint256 dayLength_,
        address owner_
    ) Ownable(owner_) {
        if (dayLength_ == 0) revert ZeroDayLength();
        usdc = usdc_;
        usdcUnit = 10 ** usdcDecimals_;
        ticketsPerUsdcPerDay = ticketsPerUsdcPerDay_;
        dayLength = dayLength_;
    }

    // ---------------------------------------------------------------------
    // Savings
    // ---------------------------------------------------------------------

    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accrue(msg.sender);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        // The eligible amount for today does not change, so a new deposit earns from the next full day.
        accounts[msg.sender].principal += amount;
        totalPrincipal += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Account storage account = accounts[msg.sender];
        if (account.principal < amount) revert InsufficientPrincipal();
        _accrue(msg.sender);
        account.principal -= amount;
        if (account.eligible > account.principal) account.eligible = account.principal;
        totalPrincipal -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function principalOf(address user) external view returns (uint256) {
        return accounts[user].principal;
    }

    // ---------------------------------------------------------------------
    // Days and Tickets
    // ---------------------------------------------------------------------

    function currentDay() public view returns (uint256) {
        return block.timestamp / dayLength;
    }

    /// @notice The timestamp when the current day ends and Tickets for it arrive.
    function dayEndsAt() external view returns (uint256) {
        return (currentDay() + 1) * dayLength;
    }

    /// @notice Tickets the user holds now. This includes every day that has ended.
    function ticketsOf(address user) public view returns (uint256 tickets) {
        (tickets,) = _preview(user);
    }

    /// @notice Tickets the user gets when the current day ends.
    function ticketsAtDayEndOf(address user) external view returns (uint256) {
        (, uint256 eligible) = _preview(user);
        return _toTickets(eligible);
    }

    /// @notice Tickets the user earns for each full day at the current deposit.
    function ticketsPerDayOf(address user) external view returns (uint256) {
        return _toTickets(accounts[user].principal);
    }

    function spendTickets(address user, uint256 amount) external onlyGame {
        if (amount == 0) revert ZeroAmount();
        _accrue(user);
        Account storage account = accounts[user];
        if (account.tickets < amount) revert InsufficientTickets();
        account.tickets -= amount;
        emit TicketsSpent(user, msg.sender, amount);
    }

    /// @notice A game pays winnings in Tickets.
    function creditTickets(address user, uint256 amount) external onlyGame {
        if (amount == 0) return;
        _accrue(user);
        accounts[user].tickets += amount;
        emit TicketsCredited(user, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Prize Points
    // ---------------------------------------------------------------------

    function awardPoints(address user, uint256 points) external onlyGame {
        if (points == 0) return;
        uint256 day = currentDay();
        pointsOf[day][user] += points;
        totalPointsOf[day] += points;
        lifetimePointsOf[user] += points;
        emit PointsAwarded(user, msg.sender, day, points);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setGame(address game, bool allowed) external onlyOwner {
        isGame[game] = allowed;
        emit GameSet(game, allowed);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _toTickets(uint256 usdcAmount) internal view returns (uint256) {
        return (usdcAmount * ticketsPerUsdcPerDay) / usdcUnit;
    }

    /// @dev Returns the Tickets after every ended day, and the eligible amount for today.
    function _preview(address user) internal view returns (uint256 tickets, uint256 eligibleToday) {
        Account storage account = accounts[user];
        uint256 today = currentDay();
        if (today == account.lastDay) return (account.tickets, account.eligible);

        // lastDay has ended. It pays its lowest balance.
        // Every day after lastDay and before today had no changes, so it pays the full principal.
        uint256 fullDays = today - account.lastDay - 1;
        tickets = account.tickets + _toTickets(account.eligible) + _toTickets(account.principal * fullDays);
        // Today started with the full principal.
        eligibleToday = account.principal;
    }

    function _accrue(address user) internal {
        (uint256 tickets, uint256 eligibleToday) = _preview(user);
        Account storage account = accounts[user];
        account.tickets = tickets;
        account.eligible = eligibleToday;
        account.lastDay = currentDay();
    }
}
