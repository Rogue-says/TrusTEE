// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title TEEscrow
 * @notice A minimal, secure escrow contract for the Mantle network.
 *         Holds buyer funds (native MNT) and allows only a TEE-secured
 *         agent wallet to release payments to sellers after off-chain
 *         verification (delivery proof + reputation check).
 *         Buyers can reclaim funds after the escrow deadline expires.
 *
 * @dev Deployed on Mantle Sepolia (Chain ID: 5003)
 *      Built for the Mantle Turing Test Hackathon 2026 –
 *      Agentic Wallets & Economy Track
 */
contract TEEscrow {
    // ──────────────────────────────────────────────
    //  Data Structures
    // ──────────────────────────────────────────────

    struct Escrow {
        address buyer;
        address seller;
        uint256 amount;
        bool released;
        bool refunded;
        uint256 deadline;
        bytes32 deliveryHash;
    }

    // ──────────────────────────────────────────────
    //  State Variables
    // ──────────────────────────────────────────────

    mapping(uint256 => Escrow) public escrows;
    uint256 public nextId;
    address public owner;
    address public agent;

    // ──────────────────────────────────────────────
    //  Reentrancy Guard
    // ──────────────────────────────────────────────

    bool private _locked;

    modifier nonReentrant() {
        require(!_locked, "ReentrancyGuard: reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event EscrowCreated(
        uint256 indexed id,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        uint256 deadline,
        bytes32 deliveryHash
    );

    event Released(uint256 indexed id, address indexed seller, uint256 amount);
    event Refunded(uint256 indexed id, address indexed buyer, uint256 amount);
    event AgentChanged(address indexed oldAgent, address indexed newAgent);
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    // ──────────────────────────────────────────────
    //  Modifiers
    // ──────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyAgent() {
        require(msg.sender == agent, "Only agent can release");
        _;
    }

    modifier escrowExists(uint256 id) {
        require(id < nextId, "Escrow does not exist");
        _;
    }

    modifier notSettled(uint256 id) {
        require(!escrows[id].released, "Already released");
        require(!escrows[id].refunded, "Already refunded");
        _;
    }

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @param _agent Initial TEE agent wallet address.
     *               Can be updated later via setAgent().
     */
    constructor(address _agent) {
        require(_agent != address(0), "Agent cannot be zero address");
        owner = msg.sender;
        agent = _agent;
    }

    // ──────────────────────────────────────────────
    //  Core Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Create a new escrow by depositing native MNT.
     * @param seller       Address of the seller who will receive funds.
     * @param deliveryHash Hash of the expected delivery proof (verified off-chain by agent).
     * @param deadline     Unix timestamp after which the buyer can claim a refund.
     * @return id          The ID of the newly created escrow.
     */
    function create(
        address seller,
        bytes32 deliveryHash,
        uint256 deadline
    ) external payable returns (uint256 id) {
        require(msg.value > 0, "Deposit must be greater than zero");
        require(seller != address(0), "Seller cannot be zero address");
        require(seller != msg.sender, "Seller cannot be the buyer");
        require(deadline > block.timestamp, "Deadline must be in the future");

        id = nextId;
        nextId++;

        escrows[id] = Escrow({
            buyer: msg.sender,
            seller: seller,
            amount: msg.value,
            released: false,
            refunded: false,
            deadline: deadline,
            deliveryHash: deliveryHash
        });

        emit EscrowCreated(id, msg.sender, seller, msg.value, deadline, deliveryHash);
    }

    /**
     * @notice Release escrow funds to the seller. Only callable by the TEE agent.
     * @dev    Uses checks-effects-interactions pattern + nonReentrant guard.
     *         Release is allowed only while block.timestamp <= deadline.
     * @param id The escrow ID to release.
     */
    function release(uint256 id)
        external
        onlyAgent
        escrowExists(id)
        notSettled(id)
        nonReentrant
    {
        Escrow storage e = escrows[id];
        require(block.timestamp <= e.deadline, "Deadline has passed");

        // Effects
        e.released = true;
        uint256 amount = e.amount;
        address seller = e.seller;

        // Interaction
        (bool success, ) = payable(seller).call{value: amount}("");
        require(success, "Transfer to seller failed");

        emit Released(id, seller, amount);
    }

    /**
     * @notice Refund escrow funds to the buyer after the deadline has passed.
     * @dev    Only the original buyer can call this, and only after deadline expiry.
     * @param id The escrow ID to refund.
     */
    function refund(uint256 id)
        external
        escrowExists(id)
        notSettled(id)
        nonReentrant
    {
        Escrow storage e = escrows[id];
        require(msg.sender == e.buyer, "Only buyer can refund");
        require(block.timestamp > e.deadline, "Deadline not yet passed");

        // Effects
        e.refunded = true;
        uint256 amount = e.amount;
        address buyer = e.buyer;

        // Interaction
        (bool success, ) = payable(buyer).call{value: amount}("");
        require(success, "Refund to buyer failed");

        emit Refunded(id, buyer, amount);
    }

    // ──────────────────────────────────────────────
    //  View Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Get full details of an escrow.
     * @param id The escrow ID to query.
     * @return The Escrow struct.
     */
    function getEscrow(uint256 id)
        external
        view
        escrowExists(id)
        returns (Escrow memory)
    {
        return escrows[id];
    }

    /**
     * @notice Get the total number of escrows created.
     * @return Total escrow count.
     */
    function getEscrowCount() external view returns (uint256) {
        return nextId;
    }

    // ──────────────────────────────────────────────
    //  Admin Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Update the authorized TEE agent address.
     * @dev    Only the contract owner can call this. This allows safe
     *         rotation if the TEE agent wallet changes or is compromised.
     * @param newAgent The new agent wallet address.
     */
    function setAgent(address newAgent) external onlyOwner {
        require(newAgent != address(0), "New agent cannot be zero address");
        address oldAgent = agent;
        agent = newAgent;
        emit AgentChanged(oldAgent, newAgent);
    }

    /**
     * @notice Transfer contract ownership to a new address.
     * @param newOwner The new owner address.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner cannot be zero address");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnerChanged(oldOwner, newOwner);
    }

    // ──────────────────────────────────────────────
    //  Fallback (reject accidental ETH sends)
    // ──────────────────────────────────────────────

    receive() external payable {
        revert("Use create() to deposit funds");
    }

    fallback() external payable {
        revert("Function does not exist");
    }
}
