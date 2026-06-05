;	Minimal CP/M-target SCC output fixture.
	.globl	fputc
	.globl	putchar
	.globl	outstr
	.globl	main
	.module	cpmhello.i
	.area	_CODE
main:
	ld	hl,#35
	push	hl
	ld	hl,#1
	push	hl
	ld	a,#2
	call	fputc
	pop	bc
	pop	bc
	ld	hl,#.0+0
	push	hl
	ld	a,#1
	call	outstr
	pop	bc
	ret
	.area	_DATA
.0:	.ascii	" HELLO, CP/M$"
	.area	_BSS
