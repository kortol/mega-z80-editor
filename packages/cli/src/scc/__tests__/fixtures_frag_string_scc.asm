	.globl	main
	.module	frag_string.i
	.area	_CODE
main:
	ld	hl,#.0+0
	ret
	.area	_DATA
.0:	.asciz	"HELLO"
	.area	_BSS
